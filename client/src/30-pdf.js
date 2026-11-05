/* ===========================================================================
 * dsh-upcv-workspace — client half, part 3: 文件文本抽取。
 *
 * PDF 提取移植自 dsh-resume-workbench/client/src/24-pdf.js（零依赖前端实现）：
 * 解析对象与对象流 → 解压 → 字体 ToUnicode CMap → 内容流抽文本，并做两项质量闸门
 * （提取过短 = 扫描件；可读字符占比过低 = 内嵌字体乱码）。两道闸门不过就明确报错，
 * 绝不把乱码喂给模型。
 *
 * DOCX 是本项目新增的：docx 就是 ZIP，取 word/document.xml 解压后剥标签即可。
 * ======================================================================== */

    const PDF_MAX_BYTES = 10 * 1024 * 1024

    function latin1(bytes) {
      let out = ''
      for (let index = 0; index < bytes.length; index += 0x8000) {
        out += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000))
      }
      return out
    }

    async function inflate(bytes, format) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    }

    /** CMap 值的十六进制 → 字符串（值是 Unicode 码元序列，恒按 2 字节一组）。 */
    function hexToUnicode(hex) {
      const clean = hex.replace(/[^0-9A-Fa-f]/gu, '')
      if (clean.length < 4 || clean.length % 4 !== 0) return ''
      let out = ''
      for (let index = 0; index < clean.length; index += 4) {
        out += String.fromCharCode(parseInt(clean.slice(index, index + 4), 16))
      }
      return out
    }

    /** 解析 ToUnicode CMap 的 bfchar / bfrange 段 → Map(字形码 → 字符串)。 */
    function parseCmap(text) {
      const map = new Map()
      for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/gu)) {
        for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/gu)) {
          map.set(parseInt(entry[1], 16), hexToUnicode(entry[2]))
        }
      }
      for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/gu)) {
        for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/gu)) {
          const lo = parseInt(entry[1], 16)
          const hi = Math.min(parseInt(entry[2], 16), lo + 65_535)
          if (entry[3] !== undefined) {
            const start = parseInt(entry[3], 16)
            for (let code = lo; code <= hi; code += 1) map.set(code, String.fromCharCode(start + (code - lo)))
          } else {
            const items = [...entry[4].matchAll(/<([0-9A-Fa-f]+)>/gu)]
            for (let code = lo; code <= hi && code - lo < items.length; code += 1) {
              map.set(code, hexToUnicode(items[code - lo][1]))
            }
          }
        }
      }
      return map
    }

    /** CMap 的字形码宽度：存在超过 1 字节的键 → 2 字节（Identity-H 类）。 */
    function cmapWidth(map) {
      for (const key of map.keys()) {
        if (key > 0xff) return 2
      }
      return 1
    }

    /** 用 CMap 解码十六进制字形串；查不到的码丢弃（宁缺勿乱）。 */
    function decodeHexWithCmap(hex, cmap, width) {
      const clean = hex.replace(/[^0-9A-Fa-f]/gu, '')
      const size = width * 2
      if (clean.length === 0 || clean.length % size !== 0) return null
      let out = ''
      for (let index = 0; index < clean.length; index += size) {
        const code = parseInt(clean.slice(index, index + size), 16)
        out += cmap.get(code) ?? ''
      }
      return out
    }

    // --- 无字体信息时的启发式回退 -------------------------------------------

    function unescapeLiteral(raw) {
      let out = ''
      for (let index = 0; index < raw.length; index += 1) {
        const ch = raw[index]
        if (ch !== '\\') { out += ch; continue }
        const next = raw[index + 1]
        if (next === undefined) break
        index += 1
        if (next >= '0' && next <= '7') {
          let octal = next
          while (octal.length < 3 && raw[index + 1] >= '0' && raw[index + 1] <= '7') {
            octal += raw[index + 1]
            index += 1
          }
          out += String.fromCharCode(parseInt(octal, 8))
          continue
        }
        const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }
        out += escapes[next] ?? next
      }
      return out
    }

    function decodeBytes(bytes) {
      if (bytes.length === 0) return ''
      if (bytes.length % 2 === 0) {
        let cjk = 0
        for (let index = 0; index < bytes.length; index += 2) {
          const high = bytes[index]
          if ((high >= 0x4e && high <= 0x9f) || high === 0x30 || high === 0xff) cjk += 1
        }
        if (cjk >= Math.max(1, Math.floor(bytes.length / 4))) {
          let out = ''
          for (let index = 0; index < bytes.length; index += 2) {
            out += String.fromCharCode((bytes[index] << 8) | bytes[index + 1])
          }
          return out
        }
      }
      let ascii = 0
      for (const byte of bytes) {
        if ((byte >= 0x20 && byte <= 0x7e) || byte === 0x0a || byte === 0x0d) ascii += 1
      }
      if (ascii / bytes.length > 0.7) return latin1(bytes)
      return null
    }

    function decodeHexHeuristic(hex) {
      const clean = hex.replace(/[^0-9A-Fa-f]/gu, '')
      if (clean.length === 0 || clean.length % 2 !== 0) return null
      const bytes = new Uint8Array(clean.length / 2)
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = parseInt(clean.slice(index * 2, index * 2 + 2), 16)
      }
      return decodeBytes(bytes)
    }

    /**
     * 内容流 → 文本。`cmapFor(name)` 返回当前字体的 {map, width} 或 null。
     * 按"逻辑行"处理：Tf 行切换字体，其余行按序抽字面量/十六进制串。
     */
    function textFromContent(content, cmapFor) {
      const marked = content
        .replace(/\bT[Jj]\b/g, '$&\n')
        .replace(/\/([A-Za-z0-9+#,.\-]+)\s+[\d.]+\s+Tf\b/g, '\n/$1 Tf\n')
        .replace(/\b(T\*|Td|TD|ET|BT)\b/g, '\n$&\n')
        .replace(/('|")\s*(?=\(|<)/g, '$1\n')
      const pieces = []
      // /g 正则有 lastIndex 状态：跨行复用会漏掉后续匹配（真机踩过），每次使用前归零
      const literalPattern = /\((?:\\[\s\S]|[^\\()])*\)/gu
      const hexPattern = /<\s*[0-9A-Fa-f\s]*\s*>/gu
      let currentFont = null
      for (const line of marked.split('\n')) {
        const tf = /^\s*\/([A-Za-z0-9+#,.\-]+)\s+Tf\s*$/u.exec(line)
        if (tf !== null) {
          currentFont = typeof cmapFor === 'function' ? cmapFor(tf[1]) : null
          continue
        }
        literalPattern.lastIndex = 0
        for (const match of line.matchAll(literalPattern)) {
          pieces.push(unescapeLiteral(match[0].slice(1, -1)))
        }
        hexPattern.lastIndex = 0
        for (const match of line.matchAll(hexPattern)) {
          const token = match[0].slice(match[0].indexOf('<') + 1, match[0].lastIndexOf('>'))
          if (token.trim() === '') continue
          const decoded = currentFont !== null
            ? decodeHexWithCmap(token, currentFont.map, currentFont.width)
            : decodeHexHeuristic(token)
          if (decoded !== null && decoded !== '') pieces.push(decoded)
        }
      }
      return pieces.join('')
    }

    // --- 对象与字体资源 ------------------------------------------------------

    /**
     * 收集 PDF 对象：普通 `N 0 obj … endobj` + ObjStm 压缩对象流展开。
     * 返回 Map(对象号 → { dict, stream: Uint8Array|null })。
     */
    async function collectObjects(raw, rawLatin) {
      const objects = new Map()
      const objPattern = /(\d+)\s+0\s+obj\b/gu
      let match
      while ((match = objPattern.exec(rawLatin)) !== null) {
        const num = Number(match[1])
        const bodyStart = match.index + match[0].length
        const streamAt = rawLatin.indexOf('stream', bodyStart)
        const endObjAt = rawLatin.indexOf('endobj', bodyStart)
        if (streamAt !== -1 && (endObjAt === -1 || streamAt < endObjAt)) {
          const dict = rawLatin.slice(bodyStart, streamAt)
          const dataStart = streamAt + 'stream'.length
          const eol = rawLatin[dataStart] === '\r'
            ? dataStart + (rawLatin[dataStart + 1] === '\n' ? 2 : 1)
            : rawLatin[dataStart] === '\n' ? dataStart + 1 : dataStart
          const end = rawLatin.indexOf('endstream', eol)
          if (end === -1) continue
          let stop = end
          // endstream 前的 EOL 属于分隔符，混进流会被解压器当 trailing junk 拒收
          while (stop > eol && (raw[stop - 1] === 0x0a || raw[stop - 1] === 0x0d)) stop -= 1
          objects.set(num, { dict, stream: raw.subarray(eol, stop) })
          // 停在 end 会把 "endstream" 里的 "stream" 再匹配一次
          objPattern.lastIndex = end + 'endstream'.length
        } else {
          const end = endObjAt === -1 ? Math.min(bodyStart + 4096, rawLatin.length) : endObjAt
          objects.set(num, { dict: rawLatin.slice(bodyStart, end), stream: null })
          objPattern.lastIndex = end + 'endobj'.length
        }
      }
      // ObjStm 展开：字体字典这类非流对象可能藏在压缩对象流里。
      // 解压是异步的，全部完成后再返回对象表。
      const objstmExpansions = []
      for (const object of objects.values()) {
        if (!/\/Type\s*\/ObjStm\b/.test(object.dict) || object.stream === null) continue
        const count = Number(/\/N\s+(\d+)/.exec(object.dict)?.[1] ?? 0)
        const first = Number(/\/First\s+(\d+)/.exec(object.dict)?.[1] ?? 0)
        if (count <= 0 || first <= 0) continue
        objstmExpansions.push(inflate(object.stream, 'deflate').then((bytes) => {
          const text = latin1(bytes)
          const header = text.slice(0, first).trim().split(/\s+/u).map(Number)
          const body = text.slice(first)
          for (let index = 0; index < Math.min(count, Math.floor(header.length / 2)); index += 1) {
            const num = header[index * 2]
            const offset = header[index * 2 + 1]
            const nextOffset = index + 1 < Math.floor(header.length / 2) ? header[(index + 1) * 2 + 1] : body.length
            if (!objects.has(num)) objects.set(num, { dict: body.slice(offset, nextOffset), stream: null })
          }
        }).catch(() => {}))
      }
      await Promise.all(objstmExpansions)
      return objects
    }

    /** 解压一个流为 latin1 文本；失败返回 null。 */
    async function streamText(stream) {
      for (const format of ['deflate', 'deflate-raw']) {
        try {
          return latin1(await inflate(stream, format))
        } catch {
          // 换下一种格式 / 放弃
        }
      }
      return null
    }

    /** 页面资源的 /Font 字典体（内联 dict 或经 /Resources 间接引用；向上继承一层）。 */
    function fontDictOf(objects, pageDict) {
      let dict = pageDict
      for (let depth = 0; depth < 3; depth += 1) {
        const inline = /\/Font\s*<<([\s\S]*?)>>/u.exec(dict)
        if (inline !== null) return inline[1]
        const ref = /\/Resources\s+(\d+)\s+0\s+R/u.exec(dict)
        if (ref !== undefined) {
          const resources = objects.get(Number(ref[1]))
          if (resources === undefined) return ''
          dict = resources.dict
          continue
        }
        const parent = /\/Parent\s+(\d+)\s+0\s+R/u.exec(dict)
        if (parent !== undefined) {
          const parentObj = objects.get(Number(parent[1]))
          if (parentObj === undefined) return ''
          dict = parentObj.dict
          continue
        }
        return ''
      }
      return ''
    }

    /**
     * 提取 PDF 文本。成功返回字符串；提不出可用文本抛 Error（message 可直接给用户）。
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Promise<string>}
     */
    async function extractPdfText(arrayBuffer) {
      const raw = new Uint8Array(arrayBuffer)
      if (raw.byteLength > PDF_MAX_BYTES) throw new Error('PDF 超过 10MB，请压缩后重试。')
      if (latin1(raw.subarray(0, 5)) !== '%PDF-') throw new Error('这不是有效的 PDF 文件。')
      const rawLatin = latin1(raw)
      const objects = await collectObjects(raw, rawLatin)

      // 字体对象号 → ToUnicode 对象号
      const fontToUnicode = new Map()
      for (const [num, object] of objects.entries()) {
        if (!/\/Type\s*\/Font\b/.test(object.dict)) continue
        const ref = /\/ToUnicode\s+(\d+)\s+0\s+R/u.exec(object.dict)
        if (ref !== null) fontToUnicode.set(num, Number(ref[1]))
      }
      // 资源名 → 字体对象号（跨页同名取先见者；简历类文档各页资源一致）
      const nameToFont = new Map()
      for (const [, object] of objects.entries()) {
        if (!/\/Type\s*\/Page\b/.test(object.dict)) continue
        for (const entry of fontDictOf(objects, object.dict).matchAll(/\/([A-Za-z0-9+#,.\-]+)\s+(\d+)\s+0\s+R/gu)) {
          if (!nameToFont.has(entry[1])) nameToFont.set(entry[1], Number(entry[2]))
        }
      }
      // 预载每个资源名的 CMap
      const fontNameCmaps = new Map()
      for (const [name, fontObj] of nameToFont.entries()) {
        const toUnicode = fontToUnicode.get(fontObj)
        if (toUnicode === undefined) {
          fontNameCmaps.set(name, null)
          continue
        }
        const target = objects.get(toUnicode)
        const text = target !== undefined && target.stream !== null ? await streamText(target.stream) : null
        const map = text === null ? new Map() : parseCmap(text)
        fontNameCmaps.set(name, map.size > 0 ? { map, width: cmapWidth(map) } : null)
      }
      const cmapFor = (name) => fontNameCmaps.get(name) ?? null

      // 页面内容流（按文档顺序）；找不到页面结构时退回"所有解压后带文本算子的流"
      const contentStreams = []
      for (const object of objects.values()) {
        if (!/\/Type\s*\/Page\b/.test(object.dict)) continue
        // 单引用（/Contents N 0 R）与数组（/Contents [ N 0 R M 0 R ]）两种形状归一成对象号列表
        const single = /\/Contents\s+(\d+)\s+0\s+R/u.exec(object.dict)
        const refs = single !== null ? [single[1]] : [...(/\/Contents\s*\[([\s\S]*?)\]/u.exec(object.dict)?.[1] ?? '').matchAll(/(\d+)\s+0\s+R/gu)].map((entry) => entry[1])
        for (const ref of refs) {
          const target = objects.get(Number(ref))
          if (target !== undefined && target.stream !== null) contentStreams.push(target.stream)
        }
      }
      if (contentStreams.length === 0) {
        for (const object of objects.values()) {
          if (object.stream === null || /\/Type\s*\/(ObjStm|Font)\b/.test(object.dict)) continue
          contentStreams.push(object.stream)
        }
      }

      const pieces = []
      for (const stream of contentStreams) {
        const text = await streamText(stream)
        if (text === null) continue
        pieces.push(textFromContent(text, cmapFor))
      }
      const text = pieces.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/gu, '\n\n').trim()
      if (text.length < 40) {
        throw new Error('这份 PDF 提不出可用文本：可能是扫描件（图片型）。请改用文字版 PDF / TXT，或直接把简历内容粘贴进输入框。')
      }
      const printable = (text.match(/[\p{Script=Han}A-Za-z0-9，。、；：！？（）@.\-—–\s/]/gu) ?? []).length
      if (printable / text.length < 0.6) {
        throw new Error('这份 PDF 的文字是内嵌字体编码（提取出的是乱码）。请导出文字版 PDF / TXT，或直接粘贴简历文本。')
      }
      return text
    }

    /** 纯文本文件直接读；PDF 走提取。 */
    async function readResumeFile(file) {
      if (file.size > PDF_MAX_BYTES) throw new Error('文件超过 10MB。')
      if (/\.pdf$/iu.test(file.name) || file.type === 'application/pdf') {
        return extractPdfText(await file.arrayBuffer())
      }
      return file.text()
    }

    /**
     * DOCX 文本抽取。docx 就是 ZIP：读中央目录找到 word/document.xml，
     * raw deflate 解压后剥标签。<w:p> 分段、<w:tab> 转空格、<w:br> 转换行。
     * 零依赖，只用 DecompressionStream。
     */
    const DOCX_MAX_BYTES = 20 * 1024 * 1024

    function zipEntries(bytes) {
      // 从尾部找 End of Central Directory（0x06054b50）
      let eocd = -1
      for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i -= 1) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break }
      }
      if (eocd === -1) throw new Error("这不是有效的 DOCX 文件（找不到 ZIP 目录）。")
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const total = view.getUint16(eocd + 10, true)
      let offset = view.getUint32(eocd + 16, true)
      const entries = []
      for (let index = 0; index < total; index += 1) {
        if (view.getUint32(offset, true) !== 0x02014b50) break
        const method = view.getUint16(offset + 10, true)
        const compressedSize = view.getUint32(offset + 20, true)
        const nameLength = view.getUint16(offset + 28, true)
        const extraLength = view.getUint16(offset + 30, true)
        const commentLength = view.getUint16(offset + 32, true)
        const localOffset = view.getUint32(offset + 42, true)
        const name = latin1(bytes.subarray(offset + 46, offset + 46 + nameLength))
        entries.push({ name, method, compressedSize, localOffset })
        offset += 46 + nameLength + extraLength + commentLength
      }
      return entries
    }

    function zipRead(bytes, entry) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const nameLength = view.getUint16(entry.localOffset + 26, true)
      const extraLength = view.getUint16(entry.localOffset + 28, true)
      const start = entry.localOffset + 30 + nameLength + extraLength
      return bytes.subarray(start, start + entry.compressedSize)
    }

    async function extractDocxText(arrayBuffer) {
      const bytes = new Uint8Array(arrayBuffer)
      if (bytes.byteLength > DOCX_MAX_BYTES) throw new Error("DOCX 超过 20MB，请压缩后重试。")
      const entries = zipEntries(bytes)
      const target = entries.find((entry) => entry.name === "word/document.xml")
      if (target === undefined) throw new Error("这份 DOCX 里没有正文（不是 Word 文档？）。")
      const compressed = zipRead(bytes, target)
      let xml
      if (target.method === 0) {
        xml = latin1(compressed)
      } else if (target.method === 8) {
        xml = latin1(await inflate(compressed, "deflate-raw"))
      } else {
        throw new Error("这份 DOCX 用了不支持的压缩方式（" + target.method + "）。")
      }
      const text = xmlToText(xml)
      if (text.length < 20) throw new Error("这份 DOCX 提不出可用文本，请改用 PDF / TXT 或直接粘贴内容。")
      return text
    }

    /** WordprocessingML → 纯文本。段落换行，制表符转空格。 */
    function xmlToText(xml) {
      const marked = xml
        .split("<w:p ").join("\n<w:p ")
        .split("<w:p>").join("\n<w:p>")
        .split("<w:tab/>").join(" ")
        .split("<w:br/>").join("\n")
      let out = ""
      let index = 0
      while (index < marked.length) {
        const lt = marked.indexOf("<", index)
        if (lt === -1) { out += decodeXmlEntities(marked.slice(index)); break }
        out += decodeXmlEntities(marked.slice(index, lt))
        const gt = marked.indexOf(">", lt)
        if (gt === -1) break
        index = gt + 1
      }
      return out.split("\n").map((line) => line.trim()).filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== "")).join("\n").trim()
    }

    function decodeXmlEntities(text) {
      return text
        .split("&lt;").join("<").split("&gt;").join(">")
        .split("&quot;").join(String.fromCharCode(34))
        .split("&apos;").join(String.fromCharCode(39))
        .split("&amp;").join("&")
    }

    /** 统一入口：按扩展名分派；不支持的格式明确报错。 */
    async function readResumeFileFull(file) {
      const name = String((file && file.name) || "").toLowerCase()
      const type = String((file && file.type) || "").toLowerCase()
      if (name.endsWith(".docx") || type.indexOf("officedocument.wordprocessingml") !== -1) {
        return extractDocxText(await file.arrayBuffer())
      }
      if (name.endsWith(".pdf") || type === "application/pdf") {
        return extractPdfText(await file.arrayBuffer())
      }
      if (name.endsWith(".doc") || type === "application/msword") {
        throw new Error("旧版 .doc 无法直接解析，请用 Word 另存为 .docx 或 PDF 后重试。")
      }
      return file.text()
    }
