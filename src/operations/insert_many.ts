import { Aspect, defineAspects, AbstractOperation } from './operation';
import { BulkWriteOperation } from './bulk_write';
import { MongoError } from '../error';
import { prepareDocs } from './common_functions';
import type { Callback } from '../utils';
import type { Collection } from '../collection';
import type { ObjectId, Document } from '../bson';
import type { BulkWriteResult, BulkWriteOptions } from '../bulk/common';
import type { Server } from '../sdam/server';
import type { ClientSession } from '../sessions';
import { ReadPreference } from '..';

/** @public */
export interface InsertManyResult {
  /** The total amount of documents inserted. */
  insertedCount: number;
  /** Map of the index of the inserted document to the id of the inserted document. */
  insertedIds: { [key: number]: ObjectId };
  /** All the documents inserted using insertOne/insertMany/replaceOne. Documents contain the _id field if forceServerObjectId == false for insertOne/insertMany */
  ops: Document[];
  /** The raw command result object returned from MongoDB (content might vary by server version). */
  result: Document;
}

/** @internal */
export class InsertManyOperation extends AbstractOperation<InsertManyResult> {
  options: BulkWriteOptions;
  collection: Collection;
  docs: Document[];

  constructor(collection: Collection, docs: Document[], options: BulkWriteOptions) {
    super(options);
    this.options = options;
    this.collection = collection;
    this.docs = docs;
  }

  execute(server: Server, session: ClientSession, callback: Callback<InsertManyResult>): void {
    const coll = this.collection;
    let docs = this.docs;
    const options = {
      ...this.options,
      ...this.bsonOptions,
      readPreference: this.readPreference
    };

    if (!Array.isArray(docs)) {
      return callback(
        MongoError.create({ message: 'docs parameter must be an array of documents', driver: true })
      );
    }

    docs = prepareDocs(coll, docs, options);

    // Generate the bulk write operations
    const operations = [{ insertMany: docs }];
    const bulkWriteOperation = new BulkWriteOperation(coll, operations, options);

    bulkWriteOperation.execute(server, session, (err, result) => {
      if (err || !result) return callback(err);
      callback(undefined, mapInsertManyResults(docs, result));
    });
  }
}

function mapInsertManyResults(docs: Document[], r: BulkWriteResult): InsertManyResult {
  const finalResult: InsertManyResult = {
    result: { ok: 1, n: r.insertedCount },
    ops: docs,
    insertedCount: r.insertedCount,
    insertedIds: r.insertedIds
  };

  if (r.getLastOp()) {
    finalResult.result.opTime = r.getLastOp();
  }

  return finalResult;
}

defineAspects(InsertManyOperation, [Aspect.WRITE_OPERATION]);
