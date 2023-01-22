const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");
let db;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log(`server running at http://localhost:3000`);
    });
  } catch (e) {
    console.log(`DB Error:${e.message}`);
  }
};
initializeDBAndServer();

//Authorization
const authenticate = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (authHeader === undefined) {
    response.status(401);
    response.send(`Invalid JWT Token`);
  } else {
    jwt.verify(jwtToken, "SECRETE-KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send(`Invalid JWT Token`);
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const userDetails = request.body;
  const { username, password, name, gender } = userDetails;
  const hashedPassword = await bcrypt.hash(password, 10);
  const lengthOfPassword = userDetails.password.length;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined && lengthOfPassword >= 6) {
    const addUserQuery = `INSERT INTO user(username, password, name, gender)
      VALUES(
          '${username}', 
          '${hashedPassword}',
          '${name}', 
          '${gender}'
      );`;
    await db.run(addUserQuery);
    response.status(200);
    response.send(`User created successfully`);
  } else if (dbUser === undefined && lengthOfPassword < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    response.status(400);
    response.send(`User already exists`);
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payload = { username: username };

      const jwtToken = jwt.sign(payload, "SECRETE-KEY");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get("/user/tweets/feed/", authenticate, async (request, response) => {
  let { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username ='${username}'`;
  const userId = await db.get(userIdQuery);
  const { user_id } = userId;

  const getUserTweetsQuery = `
        SELECT
        user.username as username,
        tweet.tweet as tweet,
        tweet.date_time as dateTime
        FROM
        follower
        INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        INNER JOIN user ON tweet.user_id = user.user_id
        WHERE
      follower.follower_user_id = '${user_id}'
        ORDER BY
        tweet.date_time DESC
        LIMIT 4`;
  const getUserTweets = await db.all(getUserTweetsQuery);
  response.send(getUserTweets);
});

//API 4
app.get("/user/following/", authenticate, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `
    SELECT 
        user_id
    FROM 
        user
    WHERE
        username='${username}';`;
  const userId = await db.get(getUserIdQuery);
  const { user_id } = userId;
  const getFollowingQuery = `
    SELECT 
        name
    FROM
        follower INNER JOIN user ON follower.following_user_id=user.user_id
    WHERE
        follower.follower_user_id=${user_id};`;
  const results = await db.all(getFollowingQuery);
  response.send(results);
});

//API 5
app.get("/user/followers/", authenticate, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `
    SELECT 
        user_id
    FROM 
        user
    WHERE
        username='${username}';`;
  const userId = await db.get(getUserIdQuery);
  const { user_id } = userId;
  const getFollowingQuery = `
    SELECT 
        name
    FROM
        follower INNER JOIN user ON follower.follower_user_id=user.user_id
    WHERE
        follower.following_user_id='${user_id}';`;
  const results = await db.all(getFollowingQuery);
  response.send(results);
});

//API 6
app.get("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const getUserIdQuery = `
        SELECT 
        user_id
        FROM 
        user
        WHERE
        username='${username}';`;
  const userId = await db.get(getUserIdQuery);
  const { user_id } = userId;
  const getFollowingQuery = `
        SELECT
        DISTINCT(tweet_id)
        FROM
        follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id
        WHERE
        follower.follower_user_id= ${user_id} and
        tweet.tweet_id=${tweetId};`;
  const results = await db.get(getFollowingQuery);
  if (results === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const tweetInfoQuery = `
            SELECT
            tweet,count(DISTINCT(like_id))as likes,count(DISTINCT(reply_id))as replies,date_time as dateTime
            FROM
            (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id ) as T INNER JOIN reply ON T.tweet_id = reply.tweet_id
            WHERE 
            tweet.tweet_id= ${tweetId};`;
    const dbResponse = await db.get(tweetInfoQuery);
    response.send(dbResponse);
  }
});
const convertLikeUsers = (list) => {
  return list.username;
};
//API 7
app.get("/tweets/:tweetId/likes/", authenticate, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;

  const getUserIdQuery = `
    SELECT 
        user_id
    FROM 
        user
    WHERE
        username='${username}';`;
  const userId = await db.get(getUserIdQuery);
  const { user_id } = userId;
  const getFollowingQuery = `
    SELECT
        DISTINCT(tweet_id)
    FROM
        follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id
    WHERE
        follower.follower_user_id= ${user_id} and
        tweet.tweet_id=${tweetId};`;
  const results = await db.get(getFollowingQuery);
  if (results === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const tweetInfoQuery = `
       SELECT
            username
       FROM
           like NATURAL JOIN user
       WHERE 
            tweet_id= ${tweetId};`;
    const getLikeUsers = await db.all(tweetInfoQuery);
    const usersList = getLikeUsers.map((list) => convertLikeUsers(list));

    response.send({ likes: usersList });
  }
});
//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  async (request, response) => {
    const { tweetId } = request.params;
    const username = request.username;
    const getUserIdQuery = `
    SELECT 
        user_id
    FROM 
        user
    WHERE
        username='${username}';`;
    const userId = await db.get(getUserIdQuery);
    const { user_id } = userId;
    const getFollowingQuery = `
    SELECT
        DISTINCT(tweet_id)
    FROM
        follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id
    WHERE
        follower.follower_user_id= ${user_id} and
        tweet.tweet_id=${tweetId};`;
    const results = await db.get(getFollowingQuery);
    if (results === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const tweetInfoQuery = `
       SELECT
            name,reply
       FROM
           reply NATURAL JOIN user
       WHERE
            tweet_id= ${tweetId};`;
      const dbResponse = await db.all(tweetInfoQuery);
      response.send({ replies: dbResponse });
    }
  }
);

//API 9
app.get("/user/tweets/", authenticate, async (request, response) => {
  const username = request.username;
  const getUserIdQuery = `
    SELECT 
        user_id
    FROM
        user
    WHERE
        username='${username}';`;
  const userId = await db.all(getUserIdQuery);
  const { user_id } = userId[0];
  const getFollowingQuery = `
   SELECT 
   tweet,
   (
       SELECT COUNT(like_id)
       FROM like
       WHERE tweet_id=tweet.tweet_id
   ) AS likes,
   (
       SELECT COUNT(reply_id)
       FROM reply
       WHERE tweet_id=tweet.tweet_id  
   ) AS replies,
   date_time AS dateTime
   FROM tweet
   WHERE user_id= '${user_id}'`;
  const results = await db.all(getFollowingQuery);
  response.send(results);
});

//API 10
app.post("/user/tweets/", authenticate, async (request, response) => {
  let { username } = request;
  const tweetBodyDetails = request.body;
  const { tweet } = tweetBodyDetails;
  const userIdQuery = `SELECT user_id FROM user WHERE username ='${username}'`;
  const userId = await db.get(userIdQuery);
  const { user_id } = userId;
  const date = new Date();
  const date_time = `${date.getFullYear()}-${
    date.getMonth() + 1
  }-${date.getDate()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  const createUserQuery = `
        INSERT INTO tweet(tweet,user_id,date_time)
        VALUES(
            '${tweet}',
            ${user_id},
           '${date_time}' );`;
  const createUserTweets = await db.run(createUserQuery);
  response.send(`Created a Tweet`);
});

//API 11
app.delete("/tweets/:tweetId/", authenticate, async (request, response) => {
  const { tweetId } = request.params;
  const username = request.username;
  const getUserIdQuery = `
    SELECT 
        user_id
    FROM 
        user
    WHERE
        username='${username}';`;
  const userId = await db.get(getUserIdQuery);
  const GetDbUserID = `
      SELECT 
        user_id
      FROM 
        tweet
      WHERE 
        tweet_id=${tweetId};`;
  const dbUserID = await db.get(GetDbUserID);
  if (userId.user_id === dbUserID.user_id) {
    const deleteTweetQuery = `
        DELETE FROM
            tweet
        WHERE
            tweet_id=${tweetId};`;
    await db.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;
