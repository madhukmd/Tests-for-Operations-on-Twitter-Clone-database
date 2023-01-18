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
    jwt.verify(jwtToken, "SECRETE-KEY", (error, playload) => {
      if (error) {
        response.status(401);
        response.send(`Invalid JWT Token`);
      } else {
        request.username = playload.username;
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
  const lengthOfPassword = password.length;
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
  } else if (dbUser === undefined && lengthOfPassWord < 6) {
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
    response.send("Invalid User");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const playload = { username: username };

      const jwtToken = jwt.sign(playload, "SECRETE-KEY");
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
  let { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username ='${username}'`;
  const userId = await db.get(userIdQuery);
  const { user_id } = userId;

  const getUserFollowingQuery = `
        SELECT
        user.username as username 
        FROM
        user
        INNER JOIN follower ON follower.following_user_id = user.user_id
        WHERE
        follower_user_id  = '${user_id}'`;
  const getUserFollowing = await db.all(getUserFollowingQuery);
  response.send(getUserFollowing);
});

//API 5
app.get("/user/followers/", authenticate, async (request, response) => {
  let { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username ='${username}'`;
  const userId = await db.get(userIdQuery);
  const { user_id } = userId;

  const getUserFollowersQuery = `
        SELECT
        user.username as username 
        FROM
        user
        INNER JOIN follower ON follower.following_user_id = user.user_id
        WHERE
        follower_user_id  = '${user_id}'`;
  const getUserFollowers = await db.all(getUserFollowersQuery);
  response.send(getUserFollowers);
});

//API 6
app.get("/tweets/:tweetId/", authenticate, async (request, response) => {
  let { username } = request;
  const { tweetId } = request.params;
  const userIdQuery = `SELECT user_id FROM user WHERE username ='${username}'`;
  const userId = await db.get(userIdQuery);
  const { user_id } = userId;

  const getTweetQuery = `
  SELECT
DISTINCT(tweet_id)
FROM
follower INNER JOIN tweet ON follower.following_user_id=tweet.user_id
WHERE
follower.follower_user_id = ${user_id} AND
tweet.tweet_id=${tweetId};`;
  const getTweet = await db.get(getTweetQuery);
  if (getTweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const tweetsQuery = `
            SELECT
            tweet,count(DISTINCT(like_id))as likes,
            count(DISTINCT(reply))as replies,
            date_time as dateTime
            FROM
            (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id ) as T INNER JOIN reply ON T.tweet_id = reply.tweet_id
            WHERE 
            tweet.tweet_id= ${tweetId};`;
    const getAllTweets = await db.all(tweetsQuery);
    response.send(getAllTweets);
  }
});
const convertLikeUsers = (list) => {
  return list.username;
};
//API 7
app.get("/tweets/:tweetId/likes/", authenticate, async (request, response) => {
  let { username } = request;
  const { tweetId } = request.params;
  const userIdQuery = `SELECT user_id FROM user WHERE username ='${username}'`;
  const userId = await db.get(userIdQuery);
  const { user_id } = userId;
  const getUserTweetsQuery = `
        select 
username
from user
where user_id IN(SELECT
distinct like.user_id
FROM
follower INNER JOIN tweet ON following_user_id = tweet.user_id
INNER JOIN like ON tweet.tweet_id = like.tweet_id
WHERE
tweet.tweet_id= ${tweetId} AND tweet.user_id = ${user_id});
`;
  const getlikeUsers = await db.all(getUserTweetsQuery);
  const usersList = getlikeUsers.map((list) => convertLikeUsers(list));

  if (usersList[0] === undefined) {
    response.status(401);
    response.send(`Invalid Request`);
  } else {
    response.send({ likes: usersList });
  }
});

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticate,
  async (request, response) => {
    let { username } = request;
    const { tweetId } = request.params;
    const userIdQuery = `SELECT user_id FROM user WHERE username ='${username}'`;
    const userId = await db.get(userIdQuery);
    const { user_id } = userId;
    const getUserTweetsQuery = `
        select 
user.name,
reply.reply
from
user 
INNER JOIN reply ON
 user.user_id = reply.reply_id
 where user.user_id IN(
SELECT
DISTINCT reply.user_id
FROM
follower INNER JOIN 
tweet ON 
follower.following_user_id
= tweet.tweet_id 
INNER JOIN 
reply ON tweet.user_id =  reply.tweet_id
INNER JOIN like ON reply.tweet_id = like.tweet_id
WHERE 
follower.follower_user_id= ${user_id}
AND 
follower.following_user_id= ${tweetId});
`;
    const getrepliesUsers = await db.all(getUserTweetsQuery);
    if (getrepliesUsers[0] === undefined) {
      response.status(401);
      response.send(`Invalid Request`);
    } else {
      response.send({ replies: getrepliesUsers });
    }
  }
);

//API 9
app.get("/user/tweets/", authenticate, async (request, response) => {
  let { username } = request;
  const userIdQuery = `SELECT user_id FROM user WHERE username ='${username}'`;
  const userId = await db.get(userIdQuery);
  const { user_id } = userId;
  const getUserAllTweetsQuery = `
        SELECT
        tweet.tweet,
        count(like.like_id) as likes,
        count(distinct reply) as replies,
        date_time as dateTime
        FROM
        user INNER JOIN 
        tweet ON 
        user.user_id
        = tweet.user_id 
        INNER JOIN 
        reply ON tweet.tweet_id =  reply.tweet_id
        INNER JOIN like ON reply.tweet_id = like.tweet_id
        WHERE 
        user.username = '${username}'
        group BY
        tweet.tweet
;`;
  const getUserAllTweets = await db.all(getUserAllTweetsQuery);
  response.send(getUserAllTweets);
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
  let { username } = request;
  const { tweetId } = request.params;
  const userIdQuery = `SELECT user_id FROM user WHERE username ='${username}'`;
  const userId = await db.get(userIdQuery);
  const { user_id } = userId;
  const deleteQuery = `
        delete from tweet
where tweet_id =
(SELECT tweet.tweet_id from user 
INNER JOIN tweet
ON user.user_id = tweet.user_id
WHERE user.user_id = ${user_id} AND tweet.tweet_id=${tweetId});
;`;
  const deleteTweet = await db.run(deleteQuery);
  if (deleteTweet.lastID !== 0) {
    response.send(`Tweet Removed`);
  } else {
    response.status(401);
    response.send(`Invalid Request`);
  }
});
module.exports = app;
