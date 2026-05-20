export type JobStatus = "pending" | "running" | "done" | "error";

export interface ConversionJob {
  id: string;
  file: File;
  codec: "mp5c" | "mp5l" | "mp5h";
  preset: number;
  status: JobStatus;
  progress: number;
  error?: string;
  result?: Uint8Array;
}

export function createJob(file: File, codec: ConversionJob["codec"], preset: number): ConversionJob {
  return {
    id: crypto.randomUUID(),
    file,
    codec,
    preset,
    status: "pending",
    progress: 0,
  };
}
