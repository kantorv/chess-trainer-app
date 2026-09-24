# IndexedDB Storage Size and Disk Usage

## Purpose

This document defines what storage-size information a web application using IndexedDB can reliably obtain through standard browser APIs.

The terminology is important:

* **Origin storage usage** — storage reported by the browser for the application's origin.
* **IndexedDB usage** — the browser's estimated portion of origin storage associated with IndexedDB.
* **Object-store data size** — the amount of application data logically contained in a particular IndexedDB object store.
* **Physical disk size** — the actual number of bytes occupied on the user's storage device.

These values are **not interchangeable**.

---

## 1. What the browser can report

The standard Storage API provides:

```ts
const estimate = await navigator.storage.estimate();

console.log(estimate.usage);
console.log(estimate.quota);
console.log(estimate.usageDetails);
```

`StorageManager.estimate()` reports an **estimate** of storage usage and quota for the current origin.

The result may contain `usageDetails`, which provides a breakdown of the reported usage by storage system. An `indexedDB` entry may therefore be available:

```ts
const estimate = await navigator.storage.estimate();

const indexedDBUsage =
    estimate.usageDetails?.indexedDB ?? 0;
```

For example:

```text
Total origin usage:     ~25 MB
IndexedDB usage:        ~23 MB
Other storage:           ~2 MB
Quota:                   ~2 GB
```

However, these numbers are explicitly **not exact byte-for-byte measurements**.

Browsers may use compression, deduplication, and other implementation techniques, and the Storage API deliberately allows the reported values to be imprecise. The specification also allows browsers to obscure exact storage usage for privacy/security reasons.

Therefore:

> `usageDetails.indexedDB` should be treated as an estimate of IndexedDB-related origin storage usage, not as the physical size of IndexedDB files on disk.

Source: MDN StorageManager `estimate()` documentation. ([MDN Web Docs][1])

---

## 2. What `usageDetails.indexedDB` does NOT tell us

It does **not** provide:

```text
database A = 12.4 MB
database B = 8.7 MB

objectStore "games"     = 5.1 MB
objectStore "positions" = 14.8 MB
```

There is no standard IndexedDB API such as:

```ts
database.size()
objectStore.size()
database.diskUsage()
objectStore.diskUsage()
```

The IndexedDB API exposes databases, object stores, records, keys, indexes, cursors, etc., but does not expose their physical storage consumption. ([MDN Web Docs][2])

Consequently, an application cannot ask the browser:

> "How many physical bytes on the disk are occupied by this particular IndexedDB object store?"

using a standard web API.

---

## 3. IndexedDB "tables" are object stores

IndexedDB does not use the SQL terminology "table".

The corresponding concept is an **object store**.

For example:

```text
ChessTrainerDB
├── games
├── positions
├── openings
└── settings
```

`games`, `positions`, `openings`, and `settings` are object stores.

An object store contains records, and IndexedDB indexes can create additional persistent structures associated with those records. ([MDN Web Docs][3])

This matters when discussing storage size because the physical storage associated with an object store can include more than simply the serialized JavaScript values returned by the application.

---

# 4. Recommended production implementation

For a storage-information UI, expose two different categories of information.

## A. Browser-reported storage usage

Use:

```ts
async function getStorageUsage() {
    const estimate = await navigator.storage.estimate();

    return {
        usage: estimate.usage ?? 0,
        quota: estimate.quota ?? 0,
        indexedDB: estimate.usageDetails?.indexedDB ?? 0,
    };
}
```

The UI should describe these values as estimates.

For example:

```text
Browser storage

IndexedDB       ~23.4 MB
Total origin    ~25.1 MB
Quota            ~2.0 GB
```

Do not display:

```text
IndexedDB       23.4 MB
```

as though this were an exact measurement of disk space.

Prefer:

```text
IndexedDB       ~23.4 MB
```

or:

```text
IndexedDB usage (estimated)    23.4 MB
```

The Storage API itself defines these values as estimates. ([MDN Web Docs][1])

---

## B. Object-store statistics

For individual object stores, report statistics that IndexedDB can actually provide.

For example:

```text
Object store       Records
───────────────────────────
games                12,431
positions            84,201
openings              3,161
settings                  1
```

The record count can be obtained directly with:

```ts
const count = await countObjectStore(db, "games");
```

using `IDBObjectStore.count()`.

`count()` returns the number of records matching the supplied key/key range, or all records when no argument is supplied. ([MDN Web Docs][4])

---

# 5. Do not use JSON.stringify() as the IndexedDB size

A tempting implementation is:

```ts
const size = new Blob([
    JSON.stringify(record)
]).size;
```

This should **not** be presented as the size of an IndexedDB record.

IndexedDB stores values using the structured clone mechanism and supports values that JSON does not represent equivalently, including types such as:

* `Blob`
* `ArrayBuffer`
* typed arrays
* `Date`
* `Map`
* `Set`
* complex nested structures

Therefore:

```ts
JSON.stringify(record)
```

measures the size of a JSON representation, not the size of the IndexedDB representation.

For example, an object containing a large `Blob` can have a completely different JSON representation from the data actually stored.

IndexedDB explicitly supports structured data and files/blobs, and uses the structured clone mechanism for stored values. ([MDN Web Docs][2])

---

# 6. Can we calculate an object-store "estimated data size"?

Yes, but this must be clearly defined as an **application-level estimate**, not disk usage.

An application can iterate through records and calculate a size according to its own rules.

For example, an application could define:

```text
estimated data size =
    size of keys
  + size of strings
  + size of ArrayBuffers
  + size of Blobs
  + size of numbers
  + recursively calculated size of objects
  + ...
```

Such a function can be useful for diagnostics:

```text
Object store: games

Records:               12,431
Estimated payload:      8.7 MB
```

But the number should be labelled:

> Estimated payload size

and **not**:

> Disk size

or:

> IndexedDB size

because the browser's storage engine may represent the data differently.

---

# 7. Indexes make physical size even less predictable

Suppose an object store contains:

```text
games
```

with indexes:

```text
byPlayer
byDate
byOpening
```

The indexes are persistent structures maintained by IndexedDB.

Therefore, the physical storage associated with this data is not simply:

```text
sum(size of JavaScript records)
```

The browser also has to maintain the indexed structures.

IndexedDB automatically updates indexes when records in their referenced object store are inserted, updated, or deleted. ([MDN Web Docs][3])

Consequently, an application-level payload calculation cannot be converted reliably into physical disk usage by simply adding a fixed overhead.

---

# 8. Physical disk usage is intentionally not exposed

The distinction is especially important:

```text
JavaScript data
       │
       ▼
IndexedDB structured-clone representation
       │
       ▼
Browser storage engine
       │
       ├── indexes
       ├── metadata
       ├── internal structures
       ├── compression
       ├── deduplication
       └── other implementation details
       │
       ▼
Physical storage
```

The web application does not control the final representation.

The Storage API explicitly notes that reported storage values may be affected by compression, deduplication, and privacy/security measures. ([MDN Web Docs][1])

Therefore, an application must not assume:

```text
physical disk bytes
=
sum of serialized IndexedDB records
```

and must not attempt to derive an exact physical size from that calculation.

---

# 9. Recommended API for a production diagnostics panel

A robust implementation should expose something like:

```ts
interface StorageDiagnostics {
    /**
     * Browser-reported estimated usage for the whole origin.
     */
    originUsage: number;

    /**
     * Browser-reported estimated quota for the origin.
     */
    originQuota: number;

    /**
     * Browser-reported estimated IndexedDB portion.
     *
     * May be unavailable depending on browser support.
     */
    indexedDBUsage: number | null;

    /**
     * Statistics calculated by the application.
     */
    stores: ObjectStoreDiagnostics[];
}

interface ObjectStoreDiagnostics {
    name: string;
    recordCount: number;

    /**
     * Optional application-defined payload estimate.
     *
     * This is NOT physical disk usage.
     */
    estimatedPayloadSize?: number;
}
```

The resulting UI could be:

```text
Storage diagnostics
──────────────────────────────────────

Browser storage
  IndexedDB usage       ~23.4 MB
  Total origin usage    ~25.1 MB
  Estimated quota         ~2.0 GB

IndexedDB

  Object store       Records       Payload*
  ──────────────────────────────────────────
  games                12,431          8.7 MB
  positions            84,201         11.2 MB
  openings              3,161          1.4 MB
  settings                  1          2 KB

  * Application-level estimate, not disk usage.
```

This gives the user useful information without making a claim that the browser cannot substantiate.

---

# 10. Browser compatibility considerations

`navigator.storage.estimate()` is widely available in current browsers and is available in secure contexts.

Nevertheless:

```ts
estimate.usageDetails
```

should be treated as optional.

The application should therefore not assume that an `indexedDB` property is always present.

Use:

```ts
const indexedDBUsage =
    estimate.usageDetails?.indexedDB ?? null;
```

and distinguish:

```text
~23 MB
```

from:

```text
Not available
```

rather than treating a missing value as zero.

`navigator.storage` and `StorageManager.estimate()` are documented as secure-context APIs. ([MDN Web Docs][1])

---

# 11. Final conclusions

| Question                                                 | Standard browser API           | Result                                            |
| -------------------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| How much storage is this origin using?                   | `navigator.storage.estimate()` | **Yes, estimated**                                |
| What is the origin's quota?                              | `navigator.storage.estimate()` | **Yes, estimated**                                |
| How much of that is IndexedDB?                           | `usageDetails.indexedDB`       | **Potentially, estimated**                        |
| How many records are in an object store?                 | `IDBObjectStore.count()`       | **Yes, exact count**                              |
| How much logical application data is in an object store? | No standard API                | **Can calculate an application-defined estimate** |
| How large is one IndexedDB database?                     | No standard API                | **No**                                            |
| How large is one object store?                           | No standard API                | **No**                                            |
| How much space do its indexes consume?                   | No standard API                | **No**                                            |
| How much physical disk space does IndexedDB consume?     | No standard web API            | **No exact value available**                      |

## Production rule

The application should use:

```ts
navigator.storage.estimate()
```

for **browser-reported origin/IndexedDB storage estimates** and IndexedDB operations such as `count()` for **exact logical database statistics**.

It should **not claim to know the physical disk size of an IndexedDB database or object store**.

Likewise, a custom serialization/size calculation should be labelled as an **application-level payload estimate**, never as actual IndexedDB or disk usage.

This distinction is not merely a matter of terminology: the browser deliberately controls the underlying storage representation, and the Storage API explicitly defines its usage figures as estimates. ([MDN Web Docs][1])

That is the version I'd be comfortable putting into a production engineering document: it does **not** rely on the earlier JSON-size shortcut, and it distinguishes the browser's `indexedDB` estimate from per-object-store and physical-disk measurements.

[1]: https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate?utm_source=chatgpt.com "StorageManager: estimate() method - Web APIs | MDN"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API?utm_source=chatgpt.com "IndexedDB API - Web APIs | MDN"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Basic_Terminology?utm_source=chatgpt.com "IndexedDB key characteristics and basic terminology - Web APIs | MDN"
[4]: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/count?utm_source=chatgpt.com "IDBObjectStore: count() method - Web APIs | MDN"
