// Small LZMA decoder for Unity asset bundles (LZMA blocks: 5-byte props, then the raw stream).
// Follows the reference decoder from the LZMA SDK (LzmaSpec.cpp).

const TOP = 2 ** 24

class RangeDecoder {
  constructor(buf, pos) {
    this.buf = buf
    this.pos = pos + 1
    this.range = 0xffffffff
    this.code = 0
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.next()) >>> 0
  }

  next() {
    return this.pos < this.buf.length ? this.buf[this.pos++] : 0
  }

  bit(probs, i) {
    const v = probs[i]
    const bound = (this.range >>> 11) * v
    let symbol
    if (this.code < bound) {
      probs[i] = v + ((2048 - v) >>> 5)
      this.range = bound
      symbol = 0
    } else {
      probs[i] = v - (v >>> 5)
      this.code -= bound
      this.range -= bound
      symbol = 1
    }
    if (this.range < TOP) {
      this.range = (this.range * 256) >>> 0
      this.code = ((this.code * 256) >>> 0) | this.next()
      this.code >>>= 0
    }
    return symbol
  }

  direct(count) {
    let res = 0
    for (let i = 0; i < count; i++) {
      this.range >>>= 1
      let b = 0
      if (this.code >= this.range) {
        this.code -= this.range
        b = 1
      }
      res = res * 2 + b
      if (this.range < TOP) {
        this.range = (this.range * 256) >>> 0
        this.code = (((this.code * 256) >>> 0) | this.next()) >>> 0
      }
    }
    return res
  }

  tree(probs, offset, bits) {
    let m = 1
    for (let i = 0; i < bits; i++) m = (m << 1) + this.bit(probs, offset + m)
    return m - (1 << bits)
  }

  reverse(probs, offset, bits) {
    let m = 1
    let symbol = 0
    for (let i = 0; i < bits; i++) {
      const b = this.bit(probs, offset + m)
      m = (m << 1) + b
      symbol |= b << i
    }
    return symbol
  }
}

class LenDecoder {
  constructor() {
    this.choice = new Uint16Array(2).fill(1024)
    this.low = new Uint16Array(16 << 3).fill(1024)
    this.mid = new Uint16Array(16 << 3).fill(1024)
    this.high = new Uint16Array(256).fill(1024)
  }

  decode(rc, posState) {
    if (rc.bit(this.choice, 0) === 0) return rc.tree(this.low, posState << 3, 3)
    if (rc.bit(this.choice, 1) === 0) return 8 + rc.tree(this.mid, posState << 3, 3)
    return 16 + rc.tree(this.high, 0, 8)
  }
}

function lzma(src, size) {
  let d = src[0]
  if (d >= 9 * 5 * 5) throw new Error('Bad LZMA properties')
  const lc = d % 9
  d = (d / 9) | 0
  const lp = d % 5
  const pb = (d / 5) | 0

  const out = Buffer.allocUnsafe(size)
  const rc = new RangeDecoder(src, 5)
  const literal = new Uint16Array(0x300 << (lc + lp)).fill(1024)
  const isMatch = new Uint16Array(12 << 4).fill(1024)
  const isRep = new Uint16Array(12).fill(1024)
  const isRepG0 = new Uint16Array(12).fill(1024)
  const isRepG1 = new Uint16Array(12).fill(1024)
  const isRepG2 = new Uint16Array(12).fill(1024)
  const isRep0Long = new Uint16Array(12 << 4).fill(1024)
  const posSlot = new Uint16Array(4 << 6).fill(1024)
  const posDecoders = new Uint16Array(115).fill(1024)
  const align = new Uint16Array(16).fill(1024)
  const lenDecoder = new LenDecoder()
  const repLenDecoder = new LenDecoder()

  const pbMask = (1 << pb) - 1
  const lpMask = (1 << lp) - 1
  let state = 0
  let rep0 = 0
  let rep1 = 0
  let rep2 = 0
  let rep3 = 0
  let pos = 0

  while (pos < size) {
    const posState = pos & pbMask
    if (rc.bit(isMatch, (state << 4) + posState) === 0) {
      const prev = pos > 0 ? out[pos - 1] : 0
      const base = 0x300 * (((pos & lpMask) << lc) + (prev >> (8 - lc)))
      let symbol = 1
      if (state >= 7) {
        let matchByte = out[pos - rep0 - 1]
        while (symbol < 0x100) {
          const matchBit = (matchByte >> 7) & 1
          matchByte <<= 1
          const b = rc.bit(literal, base + ((1 + matchBit) << 8) + symbol)
          symbol = (symbol << 1) | b
          if (matchBit !== b) break
        }
      }
      while (symbol < 0x100) symbol = (symbol << 1) | rc.bit(literal, base + symbol)
      out[pos++] = symbol - 0x100
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6
      continue
    }

    let len
    if (rc.bit(isRep, state) !== 0) {
      if (pos === 0) throw new Error('Bad LZMA data')
      if (rc.bit(isRepG0, state) === 0) {
        if (rc.bit(isRep0Long, (state << 4) + posState) === 0) {
          state = state < 7 ? 9 : 11
          out[pos] = out[pos - rep0 - 1]
          pos++
          continue
        }
      } else {
        let dist
        if (rc.bit(isRepG1, state) === 0) {
          dist = rep1
        } else {
          if (rc.bit(isRepG2, state) === 0) {
            dist = rep2
          } else {
            dist = rep3
            rep3 = rep2
          }
          rep2 = rep1
        }
        rep1 = rep0
        rep0 = dist
      }
      len = repLenDecoder.decode(rc, posState)
      state = state < 7 ? 8 : 11
    } else {
      rep3 = rep2
      rep2 = rep1
      rep1 = rep0
      len = lenDecoder.decode(rc, posState)
      state = state < 7 ? 7 : 10

      const slot = rc.tree(posSlot, (len < 3 ? len : 3) << 6, 6)
      if (slot < 4) {
        rep0 = slot
      } else {
        const directBits = (slot >> 1) - 1
        let dist = (2 | (slot & 1)) * 2 ** directBits
        if (slot < 14) dist += rc.reverse(posDecoders, dist - slot, directBits)
        else dist += rc.direct(directBits - 4) * 16 + rc.reverse(align, 0, 4)
        if (dist === 0xffffffff) break
        rep0 = dist
      }
      if (rep0 >= pos) throw new Error('Bad LZMA distance')
    }

    len += 2
    const from = pos - rep0 - 1
    const end = Math.min(pos + len, size)
    for (let k = 0; pos < end; k++) out[pos++] = out[from + k]
  }
  return pos === size ? out : out.subarray(0, pos)
}

module.exports = { lzma }
