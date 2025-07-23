import express, { urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
const app = express();
// console.log("app.js");
app.use(cors({
    origin : process.env.CORS_ORIGIN,
    credentials : true
}))

 app.use(express.json({limit : "16kb"}));
 app.use(urlencoded({extended : true}));
 app.use(express.static('public'));
 app.use(cookieParser());
 
// Routes import 

import userRouter from './routes/user.routes.js';
import debateRouter from './routes/debate.routes.js';
import adjudicationRouter from './routes/adjucation.routes.js';
import gamificationRouter from './routes/gamification.routes.js';
// import healthcheckRouter from "./routes/healthcheck.routes.js"
// import tweetRouter from "./routes/tweet.routes.js"
// import subscriptionRouter from "./routes/subscription.routes.js"
// import videoRouter from "./routes/video.routes.js"
// import commentRouter from "./routes/comment.routes.js"
// import likeRouter from "./routes/like.routes.js"
// import playlistRouter from "./routes/playlist.routes.js"
// import dashboardRouter from "./routes/dashboard.routes.js"

// routes declaration

app.use("/api/v1/users",userRouter);
app.use("/api/v1/debates", debateRouter);
app.use("/api/v1/adjudications", adjudicationRouter);
app.use("/api/v1/gamification", gamificationRouter);
// app.use("/api/v1/tweets", tweetRouter)
// app.use("/api/v1/healthcheck", healthcheckRouter)
// app.use("/api/v1/subscriptions", subscriptionRouter)
// app.use("/api/v1/videos", videoRouter)
// app.use("/api/v1/comments", commentRouter)
// app.use("/api/v1/likes", likeRouter)
// app.use("/api/v1/playlist", playlistRouter)
// app.use("/api/v1/dashboard", dashboardRouter)

export {app};
