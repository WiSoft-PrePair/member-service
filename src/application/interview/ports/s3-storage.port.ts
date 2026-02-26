export type S3UploadResult = {
  key: string;
  url: string;
};

export interface S3StoragePort {
  uploadVideo(
    file: Buffer,
    key: string,
    contentType: string,
  ): Promise<S3UploadResult>;

  getSignedUrl(key: string, expiresIn?: number): Promise<string>;

  downloadObject(key: string): Promise<Buffer>;
}

export const S3_STORAGE_PORT: symbol = Symbol("S3StoragePort");
