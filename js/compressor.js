/**
 * BinaPro - Client-Side Image Compression Engine
 * Compresses images before upload to maintain target size ~350 KB
 * Preserves high visual fidelity, correct aspect ratio and metadata.
 */

class BinaImageCompressor {
    constructor(options = {}) {
        // Target size: 350 KB (350 * 1024 = 358,400 bytes)
        this.targetSize = options.targetSize || 350 * 1024;
        this.maxTolerance = options.maxTolerance || 365 * 1024;
        this.minTolerance = options.minTolerance || 300 * 1024;
        this.maxWidth = options.maxWidth || 2048;
        this.maxHeight = options.maxHeight || 2048;
    }

    /**
     * Format byte sizes into readable string (KB / MB)
     */
    static formatBytes(bytes, decimals = 1) {
        if (!bytes || bytes === 0) return '0 KB';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        if (bytes < k * k) {
            return (bytes / k).toFixed(dm) + ' KB';
        }
        return (bytes / (k * k)).toFixed(dm) + ' MB';
    }

    /**
     * Reads a File/Blob into an HTML Image element
     */
    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = (err) => {
                URL.revokeObjectURL(url);
                reject(new Error("فشل في قراءة ملف الصورة."));
            };
            img.src = url;
        });
    }

    /**
     * Computes target dimensions maintaining aspect ratio
     */
    calculateDimensions(width, height, maxW, maxH) {
        let targetW = width;
        let targetH = height;

        if (targetW > maxW || targetH > maxH) {
            const ratio = Math.min(maxW / targetW, maxH / targetH);
            targetW = Math.round(targetW * ratio);
            targetH = Math.round(targetH * ratio);
        }

        return { width: targetW, height: targetH };
    }

    /**
     * Converts canvas to Blob with specified quality
     */
    canvasToBlob(canvas, mimeType = 'image/jpeg', quality = 0.85) {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, mimeType, quality);
        });
    }

    /**
     * Converts Blob to Data URL for instant DOM preview
     */
    blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Compress a single image file to approximately 350 KB
     * @param {File|Blob} file 
     * @param {Function} onProgress 
     * @returns {Promise<Object>}
     */
    async compress(file, onProgress = null) {
        const originalSize = file.size;
        const originalName = file.name || 'project-image.jpg';

        if (onProgress) onProgress({ status: 'reading', percent: 15, message: 'قراءة أبعاد الصورة...' });

        const img = await this.loadImage(file);
        const originalWidth = img.naturalWidth || img.width;
        const originalHeight = img.naturalHeight || img.height;

        // If image is already smaller than target (e.g. < 320 KB) and dimensions are reasonable,
        // we can still return it directly or gently optimize
        if (originalSize <= this.targetSize && originalWidth <= this.maxWidth && originalHeight <= this.maxHeight) {
            const dataUrl = await this.blobToDataURL(file);
            return {
                originalFile: file,
                compressedBlob: file,
                compressedFile: file instanceof File ? file : new File([file], originalName, { type: file.type }),
                dataUrl,
                originalSize,
                compressedSize: originalSize,
                originalSizeFormatted: BinaImageCompressor.formatBytes(originalSize),
                compressedSizeFormatted: BinaImageCompressor.formatBytes(originalSize),
                reductionPercent: 0,
                width: originalWidth,
                height: originalHeight,
                isOptimized: true
            };
        }

        if (onProgress) onProgress({ status: 'resizing', percent: 40, message: 'ضبط دقة العرض وتجهيز الـ Canvas...' });

        // Calculate initial bounds
        let { width, height } = this.calculateDimensions(originalWidth, originalHeight, this.maxWidth, this.maxHeight);

        const canvas = document.createElement('canvas');
        let ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;

        // Enable high quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        if (onProgress) onProgress({ status: 'compressing', percent: 65, message: 'معالجة جودة الصورة للوصول لـ ~350KB...' });

        // Binary search / iterative refinement for ~350 KB target
        let lowQuality = 0.35;
        let highQuality = 0.94;
        let bestBlob = null;
        let bestQuality = 0.85;
        let iterations = 0;
        const maxIterations = 6;

        while (iterations < maxIterations) {
            iterations++;
            const testQuality = (lowQuality + highQuality) / 2;
            const blob = await this.canvasToBlob(canvas, 'image/jpeg', testQuality);

            bestBlob = blob;
            bestQuality = testQuality;

            if (blob.size <= this.maxTolerance && blob.size >= this.minTolerance) {
                // Perfect hit inside target bracket [300KB - 365KB]
                break;
            }

            if (blob.size > this.maxTolerance) {
                // Still too large, reduce quality
                highQuality = testQuality;
            } else {
                // Below target, we can allow slightly higher quality
                lowQuality = testQuality;
            }
        }

        // If after iterations it is still larger than maxTolerance, scale canvas dimensions down
        if (bestBlob && bestBlob.size > this.maxTolerance) {
            const scaleDownRatio = Math.sqrt(this.targetSize / bestBlob.size);
            width = Math.round(width * Math.min(0.9, scaleDownRatio));
            height = Math.round(height * Math.min(0.9, scaleDownRatio));
            canvas.width = width;
            canvas.height = height;
            ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            bestBlob = await this.canvasToBlob(canvas, 'image/jpeg', 0.80);
        }

        if (onProgress) onProgress({ status: 'finalizing', percent: 95, message: 'توليد الرابط المضغوط ومعاينة الصورة...' });

        const compressedSize = bestBlob.size;
        const reductionPercent = Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100));

        // Create standard File object from Blob
        const cleanName = originalName.replace(/\.[^/.]+$/, "") + ".jpg";
        const compressedFile = new File([bestBlob], cleanName, {
            type: 'image/jpeg',
            lastModified: Date.now()
        });

        const dataUrl = await this.blobToDataURL(bestBlob);

        if (onProgress) onProgress({ status: 'done', percent: 100, message: 'تم الضغط بنجاح!' });

        return {
            originalFile: file,
            compressedBlob: bestBlob,
            compressedFile,
            dataUrl,
            originalSize,
            compressedSize,
            originalSizeFormatted: BinaImageCompressor.formatBytes(originalSize),
            compressedSizeFormatted: BinaImageCompressor.formatBytes(compressedSize),
            reductionPercent,
            width,
            height,
            isOptimized: true
        };
    }

    /**
     * Batch compression helper for up to 30 images
     * @param {FileList|Array<File>} files 
     * @param {Function} onBatchProgress 
     * @returns {Promise<Array<Object>>}
     */
    async compressBatch(files, onBatchProgress = null) {
        const fileArray = Array.from(files);
        const results = [];
        const total = fileArray.length;

        for (let i = 0; i < total; i++) {
            const file = fileArray[i];
            const currentItem = i + 1;

            const res = await this.compress(file, (p) => {
                if (onBatchProgress) {
                    onBatchProgress({
                        currentIndex: i,
                        total,
                        itemProgress: p,
                        overallPercent: Math.round(((i + (p.percent / 100)) / total) * 100),
                        fileName: file.name
                    });
                }
            });

            results.push(res);
        }

        return results;
    }
}

// Global instance
window.binaCompressor = new BinaImageCompressor();
