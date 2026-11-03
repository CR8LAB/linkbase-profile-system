import { Storage } from "@google-cloud/storage";

const storage = new Storage();

const bucketName = process.env.GCS_BUCKET_NAME;

if (!bucketName) {
  throw new Error("GCS_BUCKET_NAME is missing from environment variables");
}

const bucket = storage.bucket(bucketName);

export { storage, bucket };
