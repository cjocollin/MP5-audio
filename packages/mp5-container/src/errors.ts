export class Mp5Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Mp5Error";
  }
}

export class Mp5ParseError extends Mp5Error {
  constructor(message: string) {
    super(message);
    this.name = "Mp5ParseError";
  }
}

export class Mp5SecurityError extends Mp5Error {
  constructor(message: string) {
    super(message);
    this.name = "Mp5SecurityError";
  }
}

export class Mp5ValidationError extends Mp5Error {
  constructor(message: string) {
    super(message);
    this.name = "Mp5ValidationError";
  }
}
