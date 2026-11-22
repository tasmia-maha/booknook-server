
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const app = express();
const port = process.env.PORT || 5050;

const client = new MongoClient(process.env.MONGODB_URI);

async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('You successfully connected to MongoDB!');
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
  }
}
connectToMongoDB();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('BookNook server is running!');
});

app.listen(port, () => {
  console.log(`BookNook server is listening on port ${port}`);
});
// // Call this only when your application terminates
// export async function disconnectFromMongoDB() {
//   await client.close();
// }
//http://localhost:5050
