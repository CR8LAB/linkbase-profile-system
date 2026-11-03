import "dotenv/config";
import { bucket } from "../src/config/storage.js";

async function testStorage() {
  try {
    const [metadata] = await bucket.getMetadata();

    console.log("Google Cloud Storage connected successfully!");
    console.log("Bucket:", metadata.name);
    console.log("Location:", metadata.location);
    console.log("Storage class:", metadata.storageClass);
  } catch (error) {
    console.error("Google Cloud Storage connection failed:");
    console.error(error.message);
  }
}

testStorage();
