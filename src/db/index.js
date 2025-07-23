
import mongoose from "mongoose";
import {DB_NAME} from "../constant.js";
import express from "express";
const app = express();
const connectDB = async () => {
    try{
       const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`, {
           serverSelectionTimeoutMS: 30000, // 30 seconds
           socketTimeoutMS: 45000, // 45 seconds
           bufferCommands: false,
           maxPoolSize: 10,
           retryWrites: true,
           w: 'majority'
       })
    }   
    catch(error){
        console.error("MONGODB connection failed",error);
        process.exit(1);
    }
}

export default connectDB;