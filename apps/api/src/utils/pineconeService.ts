import { Pinecone, Index, RecordMetadata, PineconeRecord } from '@pinecone-database/pinecone';

let pinecone: Pinecone | null = null;
let pineconeIndex: Index<RecordMetadata> | null = null;

const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENVIRONMENT = process.env.PINECONE_ENVIRONMENT;

export const initPinecone = async (): Promise<Index<RecordMetadata>> => {
    if (pineconeIndex) {
        // console.log('[Pinecone] Already initialized.');
        return pineconeIndex;
    }

    console.log('[Pinecone] Initializing Pinecone client...');
    if (!PINECONE_API_KEY || !PINECONE_ENVIRONMENT || !PINECONE_INDEX_NAME) {
        console.error('[Pinecone] ERROR: Missing required Pinecone environment variables (API_KEY, ENVIRONMENT, INDEX_NAME).');
        throw new Error('Missing Pinecone environment variables.');
    }

    try {
        pinecone = new Pinecone({
            apiKey: PINECONE_API_KEY,
        });

        console.log(`[Pinecone] Accessing index: ${PINECONE_INDEX_NAME}...`);
        const index = pinecone.Index<RecordMetadata>(PINECONE_INDEX_NAME);
        // Optional: Check if index exists or wait for it (depends on Pinecone client version features)
        // await index.describeIndexStats(); // Example: Check if index is ready
        pineconeIndex = index;
        console.log('[Pinecone] Initialization successful. Index ready.');
        return pineconeIndex;
    } catch (error) {
        console.error('[Pinecone] ERROR: Failed to initialize Pinecone client or index:', error);
        throw new Error(`Pinecone initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

export const getPineconeIndex = async (): Promise<Index<RecordMetadata>> => {
    if (!pineconeIndex) {
        return await initPinecone();
    }
    return pineconeIndex;
};

// Use PineconeRecord or the inline structure directly
// export type PineconeVector = Vector<RecordMetadata>; // Remove this if Vector is not imported/used
export type PineconeVector = PineconeRecord<RecordMetadata>; // Use PineconeRecord with metadata type

export const upsertVectors = async (vectors: PineconeVector[], namespace?: string): Promise<void> => {
    const index = await getPineconeIndex();
    console.log(`[Pinecone] Upserting ${vectors.length} vectors${namespace ? ` to namespace '${namespace}'` : ''}...`);
    try {
        const batchSize = 100;
        for (let i = 0; i < vectors.length; i += batchSize) {
            const batch = vectors.slice(i, i + batchSize);
            console.log(`[Pinecone] Upserting batch ${i / batchSize + 1} (size: ${batch.length})...`);
            // Upsert takes an array of PineconeRecord directly
            await index.namespace(namespace || '').upsert(batch);
        }
        console.log(`[Pinecone] Upsert complete for ${vectors.length} vectors.`);
    } catch (error) {
        console.error(`[Pinecone] ERROR during upsert:`, error);
        throw new Error(`Pinecone upsert failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

// Define a type for Pinecone query filters if needed, depends on metadata structure
// Example: type PineconeQueryFilter = { [key: string]: string | number | boolean | { $in: string[] } };
type PineconeQueryFilter = object; // Using a generic object for now

export const queryVectors = async (embedding: number[], topK: number, filter?: PineconeQueryFilter, namespace?: string): Promise<any> => { // Return type depends on query options
     const index = await getPineconeIndex();
     console.log(`[Pinecone] Querying index with topK=${topK}${namespace ? ` in namespace '${namespace}'` : ''}${filter ? ' and filter...' : ''}`);
     try {
         const results = await index.namespace(namespace || '').query({
             vector: embedding,
             topK: topK,
             filter: filter,
             includeMetadata: true, // Ensure metadata is included
             includeValues: false // Usually don't need vectors themselves back
         });
         console.log(`[Pinecone] Query returned ${results.matches?.length || 0} matches.`);
         return results; // Contains 'matches', 'namespace', 'usage'
     } catch (error) {
         console.error(`[Pinecone] ERROR during query:`, error);
         throw new Error(`Pinecone query failed: ${error instanceof Error ? error.message : String(error)}`);
     }
};

export const deleteVectorsById = async (ids: string[], namespace?: string): Promise<void> => {
    const index = await getPineconeIndex();
    const ns = index.namespace(namespace || '');
    console.log(`[Pinecone] Deleting ${ids.length} vectors by ID${namespace ? ` from namespace '${namespace}'` : ''}...`);
    try {
        // Try deleteMany again
        await ns.deleteMany(ids);
        // await ns.delete({ ids: ids }); // Previous attempt
        console.log(`[Pinecone] Deletion by ID complete.`);
    } catch (error) {
        console.error(`[Pinecone] ERROR deleting vectors by ID:`, error);
        throw new Error(`Pinecone delete by ID failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};

export const deleteVectorsByFilter = async (filter: PineconeQueryFilter, namespace?: string): Promise<void> => {
    const index = await getPineconeIndex();
    const ns = index.namespace(namespace || '');
    console.log(`[Pinecone] Deleting vectors by filter${namespace ? ` from namespace '${namespace}'` : ''}...`, filter);
    try {
        // Try deleteMany again
        await ns.deleteMany(filter);
        // await ns.delete({ filter: filter }); // Previous attempt
        console.log(`[Pinecone] Deletion by filter complete.`);
    } catch (error) {
        console.error(`[Pinecone] ERROR deleting vectors by filter:`, error);
        throw new Error(`Pinecone delete by filter failed: ${error instanceof Error ? error.message : String(error)}`);
    }
};