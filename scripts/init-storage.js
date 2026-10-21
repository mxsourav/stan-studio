/**
 * STΔN Studio — Supabase Storage & Database Provisioning Script
 * 
 * Provisions the 'stl-uploads' storage bucket with:
 * - 50MB maximum file size limit (52,428,800 bytes)
 * - Public access enabled for client previews and admin processing
 */

import { getSupabaseAdmin, supabaseUrl } from '../lib/supabase.js';

const BUCKET_NAME = 'stl-uploads';
const MAX_FILE_SIZE = 52428800; // 50MB in bytes

async function initStorage() {
    console.log('========================================================');
    console.log('STΔN Studio — Supabase Storage Bucket Provisioning');
    console.log('Project URL:', supabaseUrl);
    console.log('Target Bucket:', BUCKET_NAME);
    console.log('Max File Size:', (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0) + ' MB');
    console.log('========================================================\n');

    const admin = getSupabaseAdmin();

    try {
        console.log('1. Checking existing storage buckets...');
        const { data: buckets, error: listError } = await admin.storage.listBuckets();

        if (listError) {
            console.error('Failed to list buckets:', listError.message);
            throw listError;
        }

        const existingBucket = buckets.find(b => b.name === BUCKET_NAME || b.id === BUCKET_NAME);

        if (existingBucket) {
            console.log(`✓ Bucket "${BUCKET_NAME}" already exists (id: ${existingBucket.id}).`);
            console.log('   Updating configuration (public: true, fileSizeLimit: 50MB)...');
            
            const { data: updated, error: updateError } = await admin.storage.updateBucket(BUCKET_NAME, {
                public: true,
                fileSizeLimit: MAX_FILE_SIZE,
                allowedMimeTypes: null, // Allow all standard and binary STL mime types
            });

            if (updateError) {
                console.warn('   Note: Could not update bucket settings:', updateError.message);
            } else {
                console.log('✓ Successfully confirmed bucket configuration.');
            }
        } else {
            console.log(`2. Creating new storage bucket "${BUCKET_NAME}"...`);
            const { data: newBucket, error: createError } = await admin.storage.createBucket(BUCKET_NAME, {
                public: true,
                fileSizeLimit: MAX_FILE_SIZE,
                allowedMimeTypes: null,
            });

            if (createError) {
                console.error('Failed to create bucket:', createError.message);
                throw createError;
            }
            console.log(`✓ Successfully created public storage bucket "${BUCKET_NAME}"!`);
        }

        // Final verification check
        const { data: verifiedBucket, error: getError } = await admin.storage.getBucket(BUCKET_NAME);
        if (getError) {
            console.warn('Could not re-fetch bucket details:', getError.message);
        } else {
            console.log('\nBucket Status:');
            console.log(' - Name:', verifiedBucket.name);
            console.log(' - Public:', verifiedBucket.public);
            console.log(' - File Size Limit:', verifiedBucket.file_size_limit ? `${verifiedBucket.file_size_limit / (1024 * 1024)} MB` : 'Default');
            console.log(' - Created At:', verifiedBucket.created_at);
        }

        console.log('\n========================================================');
        console.log('STORAGE PROVISIONING COMPLETED SUCCESSFULLY!');
        console.log('========================================================');
        return true;
    } catch (err) {
        console.error('\nStorage provisioning failed:', err.message || err);
        return false;
    }
}

initStorage().then(success => {
    if (!success) process.exit(1);
    process.exit(0);
});
