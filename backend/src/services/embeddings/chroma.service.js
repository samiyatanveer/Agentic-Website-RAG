/**
 * chroma.service.js
 * ChromaDB collection management and vector operations.
 *
 * SRP: All ChromaDB interactions live here.
 * Does NOT generate embeddings, chunk text, or touch SQLite.
 */

import chromaClient from '../../config/chroma.js';
import { createError } from '../../utils/errorHandler.js';
import { ERROR_CODES } from '../../config/constants.js';
import logger from '../../utils/logger.js';
import env from '../../config/env.js';

// ─── Collection bootstrap ─────────────────────────────────────────────────────

let _collectionId = null;

const collectionBasePath =
  '/api/v2/tenants/default_tenant/databases/default_database/collections';

/**
 * Get the ChromaDB collection.
 * Creates it if it does not exist.
 */
export async function getOrCreateCollection() {
  console.log('========== CHROMA SERVICE LOADED ==========');

  if (_collectionId) {
    console.log('Using cached collection ID:', _collectionId);
    return _collectionId;
  }

  const name = env.CHROMADB_COLLECTION_NAME;

  console.log('Collection name:', name);
  console.log('Collection URL:', collectionBasePath);

  try {
    // Get all collections
    const getRes = await chromaClient.get(collectionBasePath);

    console.log(
      'Collections response:',
      JSON.stringify(getRes.data, null, 2)
    );

    const collection = getRes.data.find(
      (item) => item.name === name
    );

    if (!collection) {
      const notFound = new Error(
        `Collection not found: ${name}`
      );

      notFound.response = {
        status: 404,
        data: {
          message: `Collection "${name}" was not found`
        }
      };

      throw notFound;
    }

    _collectionId = collection.id;

    logger.debug(
      `ChromaDB collection found: ${name} (id=${_collectionId})`
    );

    console.log(
      'Collection found. ID:',
      _collectionId
    );

    return _collectionId;

  } catch (getErr) {

    console.error(
      '========== CHROMADB COLLECTION ERROR =========='
    );

    console.error(
      'URL:',
      getErr.config?.url ??
      collectionBasePath
    );

    console.error(
      'STATUS:',
      getErr.response?.status
    );

    console.error(
      'RESPONSE:',
      JSON.stringify(
        getErr.response?.data,
        null,
        2
      )
    );

    console.error(
      'MESSAGE:',
      getErr.message
    );

    console.error(
      '================================================'
    );

    // ChromaDB server is not running
    if (getErr.code === 'ECONNREFUSED') {
      throw createError(
        ERROR_CODES.CHROMADB_ERROR,
        `ChromaDB not running at ${env.CHROMADB_HOST}:${env.CHROMADB_PORT}`,
        503
      );
    }

    // Unexpected error
    if (getErr.response?.status !== 404) {
      throw createError(
        ERROR_CODES.CHROMADB_ERROR,
        `Failed to get ChromaDB collection: ${getErr.message}`,
        500
      );
    }

    // Collection does not exist, so create it
    try {
      console.log(
        'Collection not found. Creating:',
        name
      );

      const createRes = await chromaClient.post(
        collectionBasePath,
        {
          name,
          metadata: {
            description:
              'Website content chunks for RAG',

            created_by:
              'agentic-website-rag'
          }
        }
      );

      _collectionId = createRes.data.id;

      logger.info(
        `ChromaDB collection created: ${name} (id=${_collectionId})`
      );

      console.log(
        'Collection created. ID:',
        _collectionId
      );

      return _collectionId;

    } catch (createErr) {

      console.error(
        '========== CHROMADB CREATE ERROR =========='
      );

      console.error(
        'URL:',
        createErr.config?.url ??
        collectionBasePath
      );

      console.error(
        'STATUS:',
        createErr.response?.status
      );

      console.error(
        'RESPONSE:',
        JSON.stringify(
          createErr.response?.data,
          null,
          2
        )
      );

      console.error(
        'MESSAGE:',
        createErr.message
      );

      console.error(
        '=========================================='
      );

      if (
        createErr.code === 'ECONNREFUSED'
      ) {
        throw createError(
          ERROR_CODES.CHROMADB_ERROR,
          `ChromaDB not running at ${env.CHROMADB_HOST}:${env.CHROMADB_PORT}`,
          503
        );
      }

      throw createError(
        ERROR_CODES.CHROMADB_ERROR,
        `Failed to create ChromaDB collection: ${
          createErr.response?.data?.error ??
          createErr.response?.data?.message ??
          createErr.message
        }`,
        500
      );
    }
  }
}

/**
 * Reset cached collection ID.
 */
export function resetCollectionCache() {
  _collectionId = null;
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Store chunk embeddings in ChromaDB.
 */
export async function upsertEmbeddings(items) {

  if (!items || items.length === 0) {
    return;
  }

  const collectionId =
    await getOrCreateCollection();

  const ids =
    items.map((item) => item.id);

  const embeddings =
    items.map((item) => item.vector);

  const documents =
    items.map((item) => item.text);

  const metadatas =
    items.map(
      (item) =>
        item.metadata ?? {}
    );

  try {

    await chromaClient.post(
      `${collectionBasePath}/${collectionId}/upsert`,
      {
        ids,
        embeddings,
        documents,
        metadatas
      }
    );

    logger.debug(
      `ChromaDB upsert: ${items.length} vectors stored`
    );

  } catch (err) {

    console.error(
      '========== CHROMADB UPSERT ERROR =========='
    );

    console.error(
      'URL:',
      err.config?.url
    );

    console.error(
      'STATUS:',
      err.response?.status
    );

    console.error(
      'RESPONSE:',
      JSON.stringify(
        err.response?.data,
        null,
        2
      )
    );

    console.error(
      '==========================================='
    );

    throw createError(
      ERROR_CODES.CHROMADB_ERROR,
      `ChromaDB upsert failed: ${
        err.response?.data?.error ??
        err.response?.data?.message ??
        err.message
      }`,
      500
    );
  }
}

// ─── Query / Similarity Search ────────────────────────────────────────────────

/**
 * Find chunks similar to the user's question.
 */
export async function querySimilar(
  queryVector,
  opts = {}
) {

  const nResults =
    opts.nResults ??
    env.RAG_N_RESULTS;

  const websiteId =
    opts.websiteId ??
    null;

  const threshold =
    opts.threshold ??
    env.RAG_SIMILARITY_THRESHOLD;

  const collectionId =
    await getOrCreateCollection();

  const body = {
    query_embeddings: [
      queryVector
    ],

    n_results:
      nResults,

    include: [
      'documents',
      'metadatas',
      'distances'
    ]
  };

  // Only search inside selected website
  if (websiteId) {

    body.where = {
      websiteId: {
        $eq: websiteId
      }
    };
  }

  console.log(
    '========== CHROMA QUERY =========='
  );

  console.log(
    'Collection ID:',
    collectionId
  );

  console.log(
    'Website ID:',
    websiteId
  );

  console.log(
    'Query URL:',
    `${collectionBasePath}/${collectionId}/query`
  );

  console.log(
    'Number of results:',
    nResults
  );

  console.log(
    '=================================='
  );

  let response;

  try {

    response =
      await chromaClient.post(
        `${collectionBasePath}/${collectionId}/query`,
        body
      );

  } catch (err) {

    console.error(
      '========== CHROMADB QUERY ERROR =========='
    );

    console.error(
      'URL:',
      err.config?.url
    );

    console.error(
      'STATUS:',
      err.response?.status
    );

    console.error(
      'RESPONSE:',
      JSON.stringify(
        err.response?.data,
        null,
        2
      )
    );

    console.error(
      'MESSAGE:',
      err.message
    );

    console.error(
      '=========================================='
    );

    throw createError(
      ERROR_CODES.CHROMADB_ERROR,
      `ChromaDB query failed: ${
        err.response?.data?.error ??
        err.response?.data?.message ??
        err.message
      }`,
      500
    );
  }

  const data =
    response.data;

  console.log(
    '========== CHROMA RETRIEVED DATA =========='
  );

  console.log(
    JSON.stringify(
      data,
      null,
      2
    )
  );

  console.log(
    '=========================================='
  );

  const ids =
    data.ids?.[0] ??
    [];

  const distances =
    data.distances?.[0] ??
    [];

  const documents =
    data.documents?.[0] ??
    [];

  const metadatas =
    data.metadatas?.[0] ??
    [];

  const results =
    ids.map(
      (id, index) => ({

        id,

        text:
          documents[index] ??
          '',

        metadata:
          metadatas[index] ??
          {},

        distance:
          distances[index] ??
          1,

        score:
          Math.max(
            0,
            Math.min(
              1,
              1 -
              (
                distances[index] ??
                1
              ) / 2
            )
          )
      })
    );

  console.log(
    'Results before threshold:',
    results.length
  );

  const filteredResults =
    threshold > 0
      ? results.filter(
          (result) =>
            result.score >= threshold
        )
      : results;

  console.log(
    'Results after threshold:',
    filteredResults.length
  );

  return filteredResults;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete selected embeddings.
 */
export async function deleteEmbeddings(ids) {

  if (!ids || ids.length === 0) {
    return;
  }

  const collectionId =
    await getOrCreateCollection();

  try {

    await chromaClient.post(
      `${collectionBasePath}/${collectionId}/delete`,
      {
        ids
      }
    );

    logger.debug(
      `ChromaDB delete: ${ids.length} vectors removed`
    );

  } catch (err) {

    throw createError(
      ERROR_CODES.CHROMADB_ERROR,
      `ChromaDB delete failed: ${
        err.response?.data?.error ??
        err.response?.data?.message ??
        err.message
      }`,
      500
    );
  }
}

export async function deleteEmbeddingsByIds(ids) {
  return deleteEmbeddings(ids);
}

/**
 * Delete every embedding belonging to one website.
 */
export async function deleteWebsiteEmbeddings(
  websiteId
) {

  const collectionId =
    await getOrCreateCollection();

  try {

    await chromaClient.post(
      `${collectionBasePath}/${collectionId}/delete`,
      {
        where: {
          websiteId: {
            $eq: websiteId
          }
        }
      }
    );

    logger.info(
      `ChromaDB: deleted all vectors for websiteId=${websiteId}`
    );

  } catch (err) {
    // Do not silently orphan vectors by deleting SQLite records when the
    // vector cleanup did not succeed. The caller will keep the source intact
    // and surface a retryable error instead.
    throw createError(
      ERROR_CODES.CHROMADB_ERROR,
      `ChromaDB cleanup failed: ${err.response?.data?.error ?? err.response?.data?.message ?? err.message}`,
      503
    );
  }
}

// ─── Info ─────────────────────────────────────────────────────────────────────

/**
 * Count all vectors in the collection.
 */
export async function countVectors() {

  try {

    const collectionId =
      await getOrCreateCollection();

    const response =
      await chromaClient.get(
        `${collectionBasePath}/${collectionId}/count`
      );

    return response.data ?? 0;

  } catch {

    return 0;
  }
}
