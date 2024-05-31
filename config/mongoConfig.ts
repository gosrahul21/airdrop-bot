import { MongoClient } from "mongodb";
import "dotenv/config";

const uri = process.env.MONGO_URI!;
const databaseName = process.env.DATABASE_NAME!;

const client = new MongoClient(uri);
export const db = client.db(databaseName);

// export const db = client.db("moral_panic_bot");
