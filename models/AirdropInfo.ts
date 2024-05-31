import { ObjectId } from "mongodb";

export type AirdropInfo = {
  _id?: ObjectId;
  poolSize: number;
  numParticipants: number;
  mintAddress?: string;
};
