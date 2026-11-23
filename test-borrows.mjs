// test-borrows.mjs — borrow → duplicate → return puro cycle test
// Run (server folder theke, server cholche obosthay): node test-borrows.mjs
const API = "http://localhost:5050";

async function call(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function main() {
  const booksRes = await call(`${API}/books`);
  const book = booksRes.data[0];
  if (!book) return console.log("FAIL: kono book nai — age seed.mjs run koro");
  console.log(`1. Book: ${book.title} (copies: ${book.totalCopies})`);

  const b1 = await call(`${API}/borrows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId: book._id, email: "test@example.com" }),
  });
  console.log(`2. Borrow: ${b1.status} — ${JSON.stringify(b1.data)}`);

  const b2 = await call(`${API}/borrows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bookId: book._id, email: "test@example.com" }),
  });
  console.log(`3. Duplicate: ${b2.status} — 409 asle thik ache (${b2.data?.message})`);

  const after = await call(`${API}/books/${book._id}`);
  console.log(`4. Copies after borrow: ${after.data.totalCopies} (age chilo ${book.totalCopies})`);

  const my = await call(`${API}/borrows?email=test@example.com`);
  console.log(`5. My borrows: ${my.data.length} ta`);
  const borrowId = my.data[0]?._id;

  const ret = await call(`${API}/borrows/${borrowId}`, { method: "DELETE" });
  console.log(`6. Return: ${ret.status} — ${JSON.stringify(ret.data)}`);

  const restored = await call(`${API}/books/${book._id}`);
  console.log(`7. Copies after return: ${restored.data.totalCopies}`);
}

main();