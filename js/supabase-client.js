/**
 * Ain Al Emarat - Supabase Direct Cloud Service
 * Real-time cloud persistence for projects, images, and storage.
 */

const SUPABASE_CONFIG = {
    url: "https://iwdahilyckhjwxsqdgku.supabase.co",
    anonKey: "sb_publishable_HBSE_5ka_09fksv9FK2pKQ_gIQNo_BK",
    bucket: "project-images",
    adminEmail: "admin@ovrax.com",
    adminPassword: "123456"
};

class BinaSupabaseService {
    constructor() {
        this.config = SUPABASE_CONFIG;
        this.client = null;
        this.sessionKey = "ain_emarat_admin_session";
        this.initClient();
    }

    /**
     * Generate standard RFC4122 UUID v4
     */
    generateUUID() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Initialize Supabase Client
     */
    initClient() {
        try {
            if (window.supabase && typeof window.supabase.createClient === 'function') {
                this.client = window.supabase.createClient(this.config.url, this.config.anonKey, {
                    auth: {
                        persistSession: true,
                        autoRefreshToken: true,
                        storage: window.localStorage
                    }
                });
                console.log("✅ تم تهيئة عميل Supabase بنجاح.");
            } else {
                console.warn("⚠️ مكتبة Supabase JS SDK لم تكتمل في التحميل بعد.");
            }
        } catch (e) {
            console.error("خطأ في تهيئة Supabase:", e);
        }
    }

    /**
     * Check Cloud Connection and RLS Permissions
     * @returns {Promise<{dbOk: boolean, storageOk: boolean, isReady: boolean, message: string}>}
     */
    async checkCloudHealth() {
        const status = {
            dbOk: false,
            storageOk: false,
            isReady: false,
            message: ""
        };

        if (!this.client) {
            status.message = "مكتبة Supabase غير محملة.";
            return status;
        }

        // 1. فحص الاتصال بقاعدة البيانات
        try {
            const { data, error } = await this.client.from('projects').select('id').limit(1);
            if (error) {
                status.dbOk = false;
                status.message = `خطأ في جدول المشاريع: ${error.message}`;
            } else {
                status.dbOk = true;
            }
        } catch (dbErr) {
            status.dbOk = false;
            status.message = `تعذر الوصول لقاعدة البيانات: ${dbErr.message}`;
        }

        // 2. فحص حاوية التخزين السحابي project-images
        try {
            const { data: bucketData, error: bucketErr } = await this.client.storage
                .from(this.config.bucket)
                .list('', { limit: 1 });

            if (bucketErr) {
                status.storageOk = false;
                if (!status.message) {
                    status.message = `حاوية التخزين ${this.config.bucket} بحاجة لتفعيل سياسات الوصول (RLS).`;
                }
            } else {
                status.storageOk = true;
            }
        } catch (stErr) {
            status.storageOk = false;
        }

        status.isReady = status.dbOk && status.storageOk;
        if (status.isReady) {
            status.message = "السحابة متصلة وجاهزة بنسبة 100% لتخزين البيانات والصور.";
        }

        return status;
    }

    /**
     * Admin Login (Supabase Cloud Auth)
     */
    async login(email, password) {
        const cleanEmail = (email || '').trim().toLowerCase();
        const cleanPassword = (password || '').trim();

        if (this.client) {
            try {
                const { data, error } = await this.client.auth.signInWithPassword({
                    email: cleanEmail,
                    password: cleanPassword
                });

                if (data && data.user) {
                    const session = {
                        user: data.user,
                        email: data.user.email,
                        token: data.session ? data.session.access_token : null,
                        mode: 'cloud',
                        timestamp: Date.now()
                    };
                    localStorage.setItem(this.sessionKey, JSON.stringify(session));
                    return { success: true, session, message: "تم تسجيل الدخول بنجاح عبر سحابة Supabase!" };
                }

                // إذا كانت بيانات الاعتماد مطابقة للمدير المعين
                if (cleanEmail === this.config.adminEmail && cleanPassword === this.config.adminPassword) {
                    const adminSession = {
                        user: { id: "admin-master-id", email: cleanEmail, role: "admin" },
                        email: cleanEmail,
                        mode: 'master-verified',
                        timestamp: Date.now()
                    };
                    localStorage.setItem(this.sessionKey, JSON.stringify(adminSession));
                    return {
                        success: true,
                        session: adminSession,
                        message: "مرحباً بك في لوحة تحكم عين الإمارات!"
                    };
                }

                if (error) {
                    throw new Error(error.message || "بيانات الدخول غير صحيحة");
                }
            } catch (err) {
                if (cleanEmail === this.config.adminEmail && cleanPassword === this.config.adminPassword) {
                    const adminSession = {
                        user: { id: "admin-master-id", email: cleanEmail, role: "admin" },
                        email: cleanEmail,
                        mode: 'master-verified',
                        timestamp: Date.now()
                    };
                    localStorage.setItem(this.sessionKey, JSON.stringify(adminSession));
                    return {
                        success: true,
                        session: adminSession,
                        message: "مرحباً بك في لوحة الإدارة!"
                    };
                }
                return { success: false, error: err.message || "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
            }
        }

        if (cleanEmail === this.config.adminEmail && cleanPassword === this.config.adminPassword) {
            const adminSession = {
                user: { id: "admin-master-id", email: cleanEmail, role: "admin" },
                email: cleanEmail,
                mode: 'local-verified',
                timestamp: Date.now()
            };
            localStorage.setItem(this.sessionKey, JSON.stringify(adminSession));
            return { success: true, session: adminSession, message: "تم تسجيل الدخول بنجاح!" };
        }

        return { success: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
    }

    /**
     * Check if currently authenticated
     */
    isAuthenticated() {
        try {
            const session = localStorage.getItem(this.sessionKey);
            if (!session) return false;
            const parsed = JSON.parse(session);
            return !!(parsed && parsed.email === this.config.adminEmail);
        } catch {
            return false;
        }
    }

    /**
     * Current user info
     */
    getCurrentUser() {
        try {
            const session = localStorage.getItem(this.sessionKey);
            return session ? JSON.parse(session) : null;
        } catch {
            return null;
        }
    }

    /**
     * Admin Logout
     */
    async logout() {
        try {
            if (this.client) {
                await this.client.auth.signOut().catch(() => {});
            }
        } finally {
            localStorage.removeItem(this.sessionKey);
        }
    }

    /**
     * Upload an image file directly to Supabase Storage Bucket (project-images)
     * @param {Object} compressedResult
     * @param {string} folder
     * @returns {Promise<string>} Public URL of the uploaded image
     */
    async uploadImage(compressedResult, folder = 'projects') {
        if (!this.client) {
            throw new Error("عميل Supabase غير متصل بالإنترنت.");
        }

        const ext = 'jpg';
        const uniqueName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${ext}`;

        // 1. Upload to Supabase Storage
        const { data, error } = await this.client.storage
            .from(this.config.bucket)
            .upload(uniqueName, compressedResult.compressedBlob, {
                contentType: 'image/jpeg',
                upsert: true
            });

        if (error) {
            console.error("فشل رفع الصورة إلى Supabase Storage:", error);
            throw new Error(`تعذر رفع الصورة إلى مساحة التخزين في Supabase: ${error.message} - يرجى التأكد من تشغيل سكربت الصلاحيات supabase_setup.sql`);
        }

        // 2. Get Public URL
        const { data: publicUrlData } = this.client.storage
            .from(this.config.bucket)
            .getPublicUrl(uniqueName);

        if (!publicUrlData || !publicUrlData.publicUrl) {
            throw new Error("فشل توليد الرابط العام للصورة المرفوعة في Supabase.");
        }

        return publicUrlData.publicUrl;
    }

    /**
     * Fetch all projects directly from Supabase Cloud Database
     */
    async getProjects() {
        if (!this.client) {
            throw new Error("عميل Supabase غير مهيأ.");
        }

        // 1. جلب المشاريع من السحابة
        const { data: projects, error } = await this.client
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error("خطأ جلب المشاريع من Supabase:", error);
            throw new Error(`تعذر استرجاع المشاريع من سحابة Supabase: ${error.message}`);
        }

        const projectList = Array.isArray(projects) ? projects : [];

        // 2. جلب إحصائيات الصور الفرعية من السحابة
        if (projectList.length > 0) {
            try {
                const { data: allImages } = await this.client
                    .from('project_images')
                    .select('project_id');

                if (allImages && Array.isArray(allImages)) {
                    projectList.forEach(p => {
                        const count = allImages.filter(img => img.project_id === p.id).length;
                        p.imageCount = count;
                    });
                }
            } catch (imgCountErr) {
                console.warn("تنبيه عداد الصور:", imgCountErr);
            }
        }

        return projectList;
    }

    /**
     * Fetch single project with its full image gallery from Supabase Cloud
     */
    async getProjectWithImages(projectId) {
        if (!this.client) {
            throw new Error("عميل Supabase غير متصل.");
        }

        const [projRes, imgRes] = await Promise.all([
            this.client.from('projects').select('*').eq('id', projectId).maybeSingle(),
            this.client.from('project_images').select('*').eq('project_id', projectId)
        ]);

        if (projRes.error) {
            throw new Error(`خطأ في جلب بيانات العمارة من Supabase: ${projRes.error.message}`);
        }

        if (!projRes.data) {
            throw new Error("العمارة أو المشروع المطلوب غير موجود في قاعدة بيانات Supabase.");
        }

        const project = projRes.data;
        const images = (imgRes.data && Array.isArray(imgRes.data)) ? imgRes.data : [];

        return {
            ...project,
            images
        };
    }

    /**
     * Create a new project in Supabase Cloud (Upload main image, insert row, upload gallery)
     */
    async createProject(projectData, mainImageFile, galleryFiles = [], onProgress = null) {
        if (!this.client) {
            throw new Error("عميل Supabase غير متصل.");
        }

        if (!mainImageFile) {
            throw new Error("يرجى اختيار الصورة الرئيسية للعمارة.");
        }

        // 1. ضغط ورفع الصورة الرئيسية إلى Supabase Storage
        if (onProgress) onProgress({ step: 1, message: "جاري فحص وضغط الصورة الرئيسية إلى ~350KB..." });
        const mainCompressed = await window.binaCompressor.compress(mainImageFile);

        if (onProgress) onProgress({ step: 1, message: "جاري رفع الصورة الرئيسية إلى حاوية Supabase Storage..." });
        const mainImageUrl = await this.uploadImage(mainCompressed, 'main');

        // 2. إدخال سجل المشروع في جدول projects في Supabase
        if (onProgress) onProgress({ step: 2, message: "جاري حفظ بيانات العمارة في قاعدة بيانات Supabase..." });
        const projectId = this.generateUUID();

        const newProject = {
            id: projectId,
            building_name: projectData.building_name.trim(),
            district: projectData.district.trim(),
            work_type: projectData.work_type.trim(),
            main_image_url: mainImageUrl,
            created_at: new Date().toISOString()
        };

        const { data: insertedProject, error: insertError } = await this.client
            .from('projects')
            .insert([newProject])
            .select()
            .single();

        if (insertError) {
            console.error("فشل حفظ المشروع في جدول projects:", insertError);
            throw new Error(`فشل إدخال المشروع في قاعدة بيانات Supabase: ${insertError.message}. يرجى التأكد من تشغيل سكربت صلاحيات SQL.`);
        }

        // 3. معالجة ورفع صور المعرض الفرعية (حتى 30 صورة)
        if (galleryFiles && galleryFiles.length > 0) {
            if (onProgress) onProgress({ step: 3, message: `جاري ضغط صور المعرض (${galleryFiles.length} صورة)...` });

            const compressedBatch = await window.binaCompressor.compressBatch(galleryFiles, (batchProgress) => {
                if (onProgress) {
                    onProgress({
                        step: 3,
                        message: `ضغط صور المعرض: ${batchProgress.currentIndex + 1} من ${batchProgress.total} (${batchProgress.overallPercent}%)`
                    });
                }
            });

            if (onProgress) onProgress({ step: 4, message: "جاري رفع صور المعرض إلى مساحة تخزين Supabase..." });

            const imageRecords = [];
            for (let i = 0; i < compressedBatch.length; i++) {
                const comp = compressedBatch[i];
                const imgUrl = await this.uploadImage(comp, 'gallery');
                const imgId = this.generateUUID();

                imageRecords.push({
                    id: imgId,
                    project_id: projectId,
                    image_url: imgUrl,
                    created_at: new Date().toISOString()
                });
            }

            if (imageRecords.length > 0) {
                const { error: galleryInsertErr } = await this.client
                    .from('project_images')
                    .insert(imageRecords);

                if (galleryInsertErr) {
                    console.error("فشل حفظ صور المعرض في Supabase:", galleryInsertErr);
                    throw new Error(`فشل حفظ صور المعرض في جدول project_images: ${galleryInsertErr.message}`);
                }
            }
        }

        if (onProgress) onProgress({ step: 5, message: "تم حفظ المشروع ومعرض الصور بنجاح في سحابة Supabase!" });
        return insertedProject || newProject;
    }

    /**
     * Update project in Supabase Cloud
     */
    async updateProject(projectId, updateData, newMainImageFile = null) {
        if (!this.client) {
            throw new Error("عميل Supabase غير متصل.");
        }

        let newMainImageUrl = null;
        if (newMainImageFile) {
            const compressed = await window.binaCompressor.compress(newMainImageFile);
            newMainImageUrl = await this.uploadImage(compressed, 'main');
        }

        const updates = {
            building_name: updateData.building_name.trim(),
            district: updateData.district.trim(),
            work_type: updateData.work_type.trim()
        };

        if (newMainImageUrl) {
            updates.main_image_url = newMainImageUrl;
        }

        const { error } = await this.client
            .from('projects')
            .update(updates)
            .eq('id', projectId);

        if (error) {
            throw new Error(`فشل تحديث بيانات العمارة في Supabase: ${error.message}`);
        }

        return { success: true };
    }

    /**
     * Delete project from Supabase Cloud (CASCADE deletes related images)
     */
    async deleteProject(projectId) {
        if (!this.client) {
            throw new Error("عميل Supabase غير متصل.");
        }

        // 1. حذف الصور المرتبطة من جدول project_images
        await this.client.from('project_images').delete().eq('project_id', projectId);

        // 2. حذف المشروع من جدول projects
        const { error } = await this.client.from('projects').delete().eq('id', projectId);

        if (error) {
            throw new Error(`فشل حذف المشروع من قاعدة بيانات Supabase: ${error.message}`);
        }

        return { success: true };
    }

    /**
     * Delete single gallery image from Supabase Cloud
     */
    async deleteGalleryImage(imageId) {
        if (!this.client) {
            throw new Error("عميل Supabase غير متصل.");
        }

        const { error } = await this.client.from('project_images').delete().eq('id', imageId);

        if (error) {
            throw new Error(`فشل حذف الصورة من Supabase: ${error.message}`);
        }

        return { success: true };
    }

    /**
     * Add more images to existing project in Supabase Cloud
     */
    async addGalleryImages(projectId, files, onProgress = null) {
        if (!this.client) {
            throw new Error("عميل Supabase غير متصل.");
        }

        if (!files || files.length === 0) return [];

        if (onProgress) onProgress({ step: 1, message: `جاري ضغط ${files.length} صورة إضافية إلى ~350KB...` });

        const compressedBatch = await window.binaCompressor.compressBatch(files, (batchProgress) => {
            if (onProgress) {
                onProgress({
                    step: 1,
                    message: `ضغط الصور الجديدة: ${batchProgress.currentIndex + 1} من ${batchProgress.total} (${batchProgress.overallPercent}%)`
                });
            }
        });

        if (onProgress) onProgress({ step: 2, message: "جاري رفع الصور إلى مساحة تخزين Supabase..." });

        const newRecords = [];
        for (let i = 0; i < compressedBatch.length; i++) {
            const comp = compressedBatch[i];
            const url = await this.uploadImage(comp, 'gallery');
            const id = this.generateUUID();

            newRecords.push({
                id,
                project_id: projectId,
                image_url: url,
                created_at: new Date().toISOString()
            });
        }

        const { error } = await this.client.from('project_images').insert(newRecords);

        if (error) {
            throw new Error(`فشل حفظ الصور الجديدة في Supabase: ${error.message}`);
        }

        return newRecords;
    }

    /**
     * Seed initial mock projects directly into Supabase Cloud
     */
    async seedCloudInitialProjects(onProgress = null) {
        if (!this.client) throw new Error("عميل Supabase غير متصل.");
        if (!window.BINA_MOCK_PROJECTS || window.BINA_MOCK_PROJECTS.length === 0) return;

        if (onProgress) onProgress("جاري إضافة النماذج الأولية إلى سحابة Supabase...");

        for (const mock of window.BINA_MOCK_PROJECTS) {
            const projRecord = {
                id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('facade-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6)),
                building_name: mock.building_name,
                district: mock.district,
                work_type: mock.work_type,
                main_image_url: mock.main_image_url,
                created_at: mock.created_at || new Date().toISOString()
            };

            await this.client.from('projects').insert([projRecord]);

            if (mock.images && Array.isArray(mock.images)) {
                const imgs = mock.images.map((url, idx) => ({
                    id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (`${projRecord.id}-img-${idx}`),
                    project_id: projRecord.id,
                    image_url: url,
                    created_at: mock.created_at || new Date().toISOString()
                }));
                await this.client.from('project_images').insert(imgs);
            }
        }
    }
}

// Global instance
window.binaService = new BinaSupabaseService();
