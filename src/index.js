import dotenv from 'dotenv';
import express from 'express';
import connectDB from './db/index.js';
import { app } from './app.js';
dotenv.config({
    path: "./.env"
});


connectDB()
    .then(() => {
        app.listen(process.env.PORT || 8000, () => {
            // Server started successfully
        });
    })
    .catch((error) => {
        console.error("MONGO DB connection failed ", error);
    });
