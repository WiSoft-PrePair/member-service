import { Injectable } from "@nestjs/common";
import { S3StoragePort, S3UploadResult } from "@/application/interview/ports";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class S3StorageAdapter implements S3StoragePort {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.client = new S3Client({
      region: this.configService.getOrThrow<string>("AWS_REGION"),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>("AWS_ACCESS_KEY_ID"),
        secretAccessKey: this.configService.getOrThrow<string>(
          "AWS_SECRET_ACCESS_KEY",
        ),
      },
    });
    this.bucket = this.configService.getOrThrow<string>("S3_BUCKET_NAME");
  }

  async uploadVideo(
    file: Buffer,
    key: string,
    contentType: string,
  ): Promise<S3UploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file,
        ContentType: contentType,
      }),
    );

    return {
      key,
      url: `https://s3.wisoft.dev/${this.bucket}/${key}`,
    };
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  async downloadObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    const stream = response.Body;
    if (!stream) {
      throw new Error(`S3 object not found: ${key}`);
    }

    const byteArray = await stream.transformToByteArray();
    return Buffer.from(byteArray);
  }
}
