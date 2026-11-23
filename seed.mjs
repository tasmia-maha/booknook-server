// seed.mjs — rich test data for BookNook
// Run (server folder theke): node --env-file=.env seed.mjs
import { MongoClient } from "mongodb";
import dns from "dns";

dns.setDefaultResultOrder("ipv4first");

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGODB_URI pai nai. Run koro: node --env-file=.env seed.mjs");
  process.exit(1);
}

const books = [
  {
    title: "The Alchemist",
    author: "Paulo Coelho",
    category: "Fiction",
    image: "https://i.ibb.co.com/Y750G1Pd/The-Alchemist.jpg",
    description:
      "A young shepherd named Santiago travels from the hills of Andalusia to the Egyptian desert in search of a treasure buried near the pyramids. Along the way he meets a king, a crystal merchant, and an alchemist who each teach him something about listening to his heart. The story turns his journey into a gentle lesson about dreams, fear, and the Personal Legend that every person carries. Readers come away with a simple but lasting message: when you want something deeply, the whole world conspires to help you.",
    totalCopies: 3,
    publicationYear: 1988,
    language: "English",
    publisher: "HarperOne",
    addedByName: "Rahim Uddin",
    addedByEmail: "rahim.uddin@example.com",
    createdAt: new Date("2026-11-05T10:00:00Z"),
  },
  {
    title: "Clean Code",
    author: "Robert C. Martin",
    category: "Programming",
    image: "https://i.ibb.co.com/rKL9c9PN/Clean-Code.jpg",
    description:
      "Even bad code can work, but it quietly drags a whole team down. In this classic, Robert C. Martin walks through real before-and-after examples showing how to name things clearly, write small functions, and shape code so the next reader understands it. Later chapters take a messy application and clean it up step by step, like refactoring in slow motion. It is the book most professional developers recommend first to anyone writing code that other people must maintain.",
    totalCopies: 2,
    publicationYear: 2008,
    language: "English",
    publisher: "Prentice Hall",
    addedByName: "Nusrat Jahan",
    addedByEmail: "nusrat.jahan@example.com",
    createdAt: new Date("2026-11-08T10:00:00Z"),
  },
  {
    title: "Atomic Habits",
    author: "James Clear",
    category: "Self-Help",
    image: "https://i.ibb.co.com/3yGMZrKF/Atomic-Habits.jpg",
    description:
      "James Clear argues that big goals matter far less than the small systems you repeat every day. Drawing on biology, psychology, and his own experiments, he shows how to design cues, cravings, and rewards so good habits feel almost automatic. The book is full of practical tools such as habit stacking, the two-minute rule, and environment design that you can apply the same evening you read about them. It is less about motivation and more about building an environment where the right choice becomes the easy choice.",
    totalCopies: 5,
    publicationYear: 2018,
    language: "English",
    publisher: "Avery",
    addedByName: "Tanvir Ahmed",
    addedByEmail: "tanvir.ahmed@example.com",
    createdAt: new Date("2026-11-12T10:00:00Z"),
  },
  {
    title: "Harry Potter and the Philosopher's Stone",
    author: "J.K. Rowling",
    category: "Fantasy",
    image: "https://i.ibb.co.com/hJSRk4qD/Harry-Potter.jpg",
    description:
      "On his eleventh birthday, an orphan named Harry Potter discovers he is a wizard and has been accepted to Hogwarts School of Witchcraft and Wizardry. There he finds friendship with Ron and Hermione, a talent for flying, and a mystery involving a three-headed dog and a hidden stone. The book introduces the characters and the magical world that grew into a global phenomenon. A warm, funny, and exciting read for anyone who enjoys magic, boarding schools, and brave underdogs.",
    totalCopies: 0,
    publicationYear: 1997,
    language: "English",
    publisher: "Bloomsbury",
    addedByName: "Sadia Islam",
    addedByEmail: "sadia.islam@example.com",
    createdAt: new Date("2026-11-02T10:00:00Z"),
  },
  {
    title: "Deep Work",
    author: "Cal Newport",
    category: "Productivity",
    image: "https://i.ibb.co.com/fdpGrbT4/Deep-Work.jpg",
    description:
      "Cal Newport claims that the ability to focus without distraction is becoming both rarer and more valuable at exactly the same time. He separates shallow work such as emails, messages, and busy multitasking from deep work, the sustained concentration that produces real results. The second half is a training manual with rituals, schedules, and rules for defending long blocks of attention in a noisy world. Essential reading for students and programmers who feel busy all day but finish nothing important.",
    totalCopies: 1,
    publicationYear: 2016,
    language: "English",
    publisher: "Grand Central Publishing",
    addedByName: "Mehedi Hasan",
    addedByEmail: "mehedi.hasan@example.com",
    createdAt: new Date("2026-11-15T10:00:00Z"),
  },
  {
    title: "The Pragmatic Programmer",
    author: "Andrew Hunt",
    category: "Programming",
    image: "https://i.ibb.co.com/Ngbv0R83/The-Pragmatic-Programmer.png",
    description:
      "Two experienced engineers share the habits that separate effective programmers from frustrated ones. Topics range from DRY principles and orthogonal design to debugging mindsets, automation, and pragmatic project management. Each short chapter ends with quick challenges you can try on your own codebase the same day. Twenty years after publication it is still one of the most quoted books on how to think like a professional developer.",
    totalCopies: 4,
    publicationYear: 1999,
    language: "English",
    publisher: "Addison-Wesley",
    addedByName: "Farhana Akter",
    addedByEmail: "farhana.akter@example.com",
    createdAt: new Date("2026-11-10T10:00:00Z"),
  },
  {
    title: "Ikigai",
    author: "Héctor García",
    category: "Self-Help",
    image: "https://i.ibb.co.com/LX7WtvVJ/Ikigai.jpg" ,
    description:
      "In the small villages of Okinawa, people keep working, gardening, and laughing well past one hundred years of age. The authors travel there to understand ikigai, the reason you wake up in the morning, and how it shapes diet, movement, community, and purpose. The book mixes interviews with centenarians and practical advice on finding your own reason to get up. A calm, hopeful read if you are thinking about what a meaningful life and daily routine should look like.",
    totalCopies: 2,
    publicationYear: 2016,
    language: "English",
    publisher: "Penguin Books",
    addedByName: "Arif Chowdhury",
    addedByEmail: "arif.chowdhury@example.com",
    createdAt: new Date("2026-11-18T10:00:00Z"),
  },
];

async function main() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    // IMPORTANT: db name ta tomar index.js er client.db("...") er sathe same rakho
    const col = client.db("booknook").collection("books");
    await col.deleteMany({});
    const result = await col.insertMany(books);
    console.log(`Old data cleared. Inserted ${result.insertedCount} books.`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});