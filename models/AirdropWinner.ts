import { ObjectId } from "mongodb";

export type AirdropWinner = {
  _id?: ObjectId;
  telegramId: number;
  addressPublicKey: string;
  numTokens?: number;
};
