//! Packed bit stream for Rice residuals.

pub struct BitWriter {
    pub bytes: Vec<u8>,
    acc: u8,
    n: u8,
}

impl BitWriter {
    pub fn new() -> Self {
        Self {
            bytes: Vec::new(),
            acc: 0,
            n: 0,
        }
    }

    pub fn write_bit(&mut self, bit: u8) {
        if bit != 0 {
            self.acc |= 1 << self.n;
        }
        self.n += 1;
        if self.n == 8 {
            self.bytes.push(self.acc);
            self.acc = 0;
            self.n = 0;
        }
    }

    pub fn write_bits(&mut self, v: u32, count: u8) {
        for i in 0..count {
            self.write_bit(((v >> i) & 1) as u8);
        }
    }

    pub fn finish(mut self) -> Vec<u8> {
        if self.n > 0 {
            self.bytes.push(self.acc);
        }
        self.bytes
    }
}

pub struct BitReader<'a> {
    data: &'a [u8],
    byte_i: usize,
    bit_i: u8,
}

impl<'a> BitReader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self {
            data,
            byte_i: 0,
            bit_i: 0,
        }
    }

    pub fn read_bit(&mut self) -> Option<u8> {
        if self.byte_i >= self.data.len() {
            return None;
        }
        let b = (self.data[self.byte_i] >> self.bit_i) & 1;
        self.bit_i += 1;
        if self.bit_i == 8 {
            self.bit_i = 0;
            self.byte_i += 1;
        }
        Some(b)
    }

    pub fn read_bits(&mut self, count: u8) -> Option<u32> {
        let mut v = 0u32;
        for i in 0..count {
            let bit = self.read_bit()?;
            v |= (bit as u32) << i;
        }
        Some(v)
    }
}
