import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

// Event banner images on Cloudinary, shared by create (POST) and edit (PATCH).

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Null when the file is acceptable, else the user facing reason. */
export function imageProblem(file: FormDataEntryValue | null): string | null {
    if (!(file instanceof File) || file.size === 0) return 'Image file is required';
    if (!file.type.startsWith('image/')) return 'Image must be an image file';
    if (file.size > MAX_IMAGE_BYTES) return 'Image must be 5 MB or smaller';
    return null;
}

export const uploadsConfigured = () => Boolean(process.env.CLOUDINARY_URL);

export const uploadImage = (buffer: Buffer) =>
    new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader.upload_stream({ resource_type: 'image', folder: 'DevEvent' }, (error, result) => {
            if (error || !result) return reject(error ?? new Error('Upload returned no result'));
            resolve(result);
        }).end(buffer);
    });

/** Removes an image; never throws (a leftover image is logged, not fatal). */
export async function destroyImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId).catch((err) => console.error('Failed to remove Cloudinary image', publicId, err));
}
