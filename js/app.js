/**
 * Ain Al Emarat - Main Application Controller
 * Handles UI interactions, view switching, lightbox gallery,
 * admin operations, batch image compression, and Supabase cloud sync.
 */

const SUPABASE_SETUP_SQL = `-- سكربت تفعيل قاعدة بيانات ومساحة تخزين Supabase لشركة عين الإمارات
-- انسخ هذا الكود بالكامل والصقه في SQL Editor داخل موقع Supabase ثم اضغط Run

-- 1. التأكد من وجود جدول المشاريع الرئيسي (projects)
create table if not exists public.projects (
    id uuid default gen_random_uuid() primary key,
    building_name text not null,
    district text not null,
    work_type text not null,
    main_image_url text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. التأكد من وجود جدول صور المعرض (project_images)
create table if not exists public.project_images (
    id uuid default gen_random_uuid() primary key,
    project_id uuid references public.projects(id) on delete cascade not null,
    image_url text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_project_images_project_id on public.project_images(project_id);

-- 3. تفعيل وإعداد سياسات الوصول (RLS) للجداول لتسمح بالقراءة والإضافة والتعديل والحذف
alter table public.projects enable row level security;
alter table public.project_images enable row level security;

drop policy if exists "Allow Full Access projects" on public.projects;
drop policy if exists "Public Read Projects" on public.projects;
drop policy if exists "Allow Public Access projects" on public.projects;
create policy "Allow Public Access projects" on public.projects for all using (true) with check (true);

drop policy if exists "Allow Full Access project_images" on public.project_images;
drop policy if exists "Public Read Project Images" on public.project_images;
drop policy if exists "Allow Public Access project_images" on public.project_images for all using (true) with check (true);

-- 4. إنشاء وتفعيل حاوية التخزين السحابي للصور (project-images) وجعلها عامة
insert into storage.buckets (id, name, public) 
values ('project-images', 'project-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public Access Storage" on storage.objects;
create policy "Public Access Storage" on storage.objects for select using (bucket_id = 'project-images');

drop policy if exists "Allow Uploads Storage" on storage.objects;
create policy "Allow Uploads Storage" on storage.objects for insert with check (bucket_id = 'project-images');

drop policy if exists "Allow Updates Storage" on storage.objects;
create policy "Allow Updates Storage" on storage.objects for update using (bucket_id = 'project-images');

drop policy if exists "Allow Deletions Storage" on storage.objects;
create policy "Allow Deletions Storage" on storage.objects for delete using (bucket_id = 'project-images');

-- 5. تفعيل وتأكيد بريد المدير فوراً
update auth.users set email_confirmed_at = timezone('utc'::text, now()) where email = 'admin@ovrax.com';`;

class BinaProApp {
    constructor() {
        this.currentView = 'catalog';
        this.currentCategory = 'الكل';
        this.searchQuery = '';
        this.allProjects = [];

        // Lightbox state
        this.activeLightboxProject = null;
        this.activeImageIndex = 0;

        // Admin Add Project state
        this.newMainImageFile = null;
        this.newGalleryFiles = [];

        // Admin Gallery Management state
        this.managingProjectId = null;
        this.managingProject = null;

        // DOM Elements
        this.initDOMElements();
        this.initEvents();
    }

    initDOMElements() {
        // Views
        this.catalogView = document.getElementById('catalog-view');
        this.adminLoginView = document.getElementById('admin-login-view');
        this.adminDashboardView = document.getElementById('admin-dashboard-view');
        this.galleryManageView = document.getElementById('gallery-manage-view');

        // Nav & Buttons
        this.navBrand = document.getElementById('nav-brand');
        this.navCatalog = document.getElementById('nav-catalog');
        this.navAdminBtn = document.getElementById('nav-admin-btn');
        this.navAdminLink = document.getElementById('nav-admin-link');
        this.adminLogoutBtn = document.getElementById('admin-logout-btn');
        this.adminReturnBtn = document.getElementById('admin-return-btn');

        // Catalog UI
        this.projectsGrid = document.getElementById('projects-grid');
        this.searchInput = document.getElementById('search-input');
        this.filterPills = document.querySelectorAll('.filter-pill');
        this.statProjectsCount = document.getElementById('stat-projects-count');
        this.statImagesCount = document.getElementById('stat-images-count');
        this.statCitiesCount = document.getElementById('stat-cities-count');

        // Lightbox Modal
        this.galleryModal = document.getElementById('gallery-modal');
        this.galleryModalClose = document.getElementById('gallery-modal-close');
        this.galleryMainImg = document.getElementById('gallery-main-img');
        this.galleryPrevBtn = document.getElementById('gallery-prev-btn');
        this.galleryNextBtn = document.getElementById('gallery-next-btn');
        this.galleryThumbStrip = document.getElementById('gallery-thumb-strip');
        this.galleryModalTitle = document.getElementById('gallery-modal-title');
        this.galleryModalSub = document.getElementById('gallery-modal-sub');
        this.galleryCounterTag = document.getElementById('gallery-counter-tag');
        this.galleryWhatsappBtn = document.getElementById('gallery-whatsapp-btn');

        // Admin Login
        this.loginForm = document.getElementById('admin-login-form');
        this.loginEmailInput = document.getElementById('login-email');
        this.loginPasswordInput = document.getElementById('login-password');

        // Admin Tabs
        this.adminTabs = document.querySelectorAll('.admin-tab');
        this.tabContents = document.querySelectorAll('.tab-content');

        // Add Project Form
        this.addProjectForm = document.getElementById('add-project-form');
        this.mainImageInput = document.getElementById('main-image-input');
        this.mainDropzone = document.getElementById('main-image-dropzone');
        this.mainImagePreview = document.getElementById('main-image-preview');
        this.mainCompressionBadge = document.getElementById('main-compression-badge');

        this.galleryImagesInput = document.getElementById('gallery-images-input');
        this.galleryDropzone = document.getElementById('gallery-dropzone');
        this.galleryPreviewsGrid = document.getElementById('gallery-previews-grid');

        this.uploadProgressBar = document.getElementById('upload-progress-bar');
        this.uploadProgressFill = document.getElementById('upload-progress-fill');
        this.uploadProgressStatus = document.getElementById('upload-progress-status');
        this.uploadProgressPercent = document.getElementById('upload-progress-percent');
        this.btnSaveProject = document.getElementById('btn-save-project');

        // Manage Projects
        this.adminProjectsTableBody = document.getElementById('admin-projects-table-body');

        // Gallery Manage Sub-View
        this.manageProjectTitle = document.getElementById('manage-gallery-project-title');
        this.manageGalleryGrid = document.getElementById('manage-gallery-grid');
        this.backToProjectsBtn = document.getElementById('back-to-projects-btn');
        this.addMoreGalleryInput = document.getElementById('add-more-gallery-input');
        this.btnAddMoreGallery = document.getElementById('btn-add-more-gallery');

        // Edit Modal
        this.editModal = document.getElementById('edit-project-modal');
        this.editModalClose = document.getElementById('edit-modal-close');
        this.editProjectForm = document.getElementById('edit-project-form');
        this.editProjectId = document.getElementById('edit-project-id');
        this.editBuildingName = document.getElementById('edit-building-name');
        this.editDistrict = document.getElementById('edit-district');
        this.editWorkType = document.getElementById('edit-work-type');
        this.editMainImageInput = document.getElementById('edit-main-image-input');

        // Cloud Status Banner Elements
        this.cloudStatusBanner = document.getElementById('cloud-status-banner');
        this.cloudStatusIcon = document.getElementById('cloud-status-icon');
        this.cloudStatusTitle = document.getElementById('cloud-status-title');
        this.cloudStatusDesc = document.getElementById('cloud-status-desc');
        this.btnCopySql = document.getElementById('btn-copy-sql');
        this.btnRecheckCloud = document.getElementById('btn-recheck-cloud');

        // SQL Modal Elements
        this.sqlSetupModal = document.getElementById('sql-setup-modal');
        this.sqlModalClose = document.getElementById('sql-modal-close');
        this.sqlCodeTextarea = document.getElementById('sql-code-textarea');
        this.btnModalCopySql = document.getElementById('btn-modal-copy-sql');

        // Toast Container
        this.toastContainer = document.getElementById('toast-container');
    }

    initEvents() {
        // Navigation clicks
        this.navBrand?.addEventListener('click', () => this.switchView('catalog'));
        this.navCatalog?.addEventListener('click', () => this.switchView('catalog'));
        this.navAdminBtn?.addEventListener('click', () => this.handleAdminNav());
        this.navAdminLink?.addEventListener('click', () => this.handleAdminNav());
        this.adminReturnBtn?.addEventListener('click', () => this.switchView('catalog'));

        // Search & Filter
        this.searchInput?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.trim().toLowerCase();
            this.renderCatalog();
        });

        this.filterPills.forEach(pill => {
            pill.addEventListener('click', () => {
                this.filterPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this.currentCategory = pill.getAttribute('data-category') || 'الكل';
                this.renderCatalog();
            });
        });

        // Lightbox Navigation
        this.galleryModalClose?.addEventListener('click', () => this.closeLightbox());
        this.galleryPrevBtn?.addEventListener('click', () => this.navigateLightbox(-1));
        this.galleryNextBtn?.addEventListener('click', () => this.navigateLightbox(1));
        this.galleryModal?.addEventListener('click', (e) => {
            if (e.target === this.galleryModal) this.closeLightbox();
        });

        // Keyboard Controls
        window.addEventListener('keydown', (e) => {
            if (this.galleryModal.classList.contains('active')) {
                if (e.key === 'Escape') this.closeLightbox();
                if (e.key === 'ArrowRight') this.navigateLightbox(-1);
                if (e.key === 'ArrowLeft') this.navigateLightbox(1);
            }
        });

        // Mobile & Tablet Touch Swipe Gestures for Lightbox
        let touchStartX = 0;
        let touchEndX = 0;
        const minSwipeDistance = 45;

        this.galleryModal?.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        this.galleryModal?.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            const distance = touchEndX - touchStartX;
            if (Math.abs(distance) > minSwipeDistance) {
                if (distance > 0) {
                    // Swiped Right -> Previous
                    this.navigateLightbox(-1);
                } else {
                    // Swiped Left -> Next
                    this.navigateLightbox(1);
                }
            }
        }, { passive: true });

        // Hash Routing
        window.addEventListener('hashchange', () => this.handleHashChange());

        // Admin Login
        this.loginForm?.addEventListener('submit', (e) => this.handleAdminLogin(e));
        this.adminLogoutBtn?.addEventListener('click', () => this.handleAdminLogout());

        // Admin Tabs
        this.adminTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetTab = tab.getAttribute('data-tab');
                this.adminTabs.forEach(t => t.classList.remove('active'));
                this.tabContents.forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`tab-${targetTab}`)?.classList.add('active');
                if (targetTab === 'manage') {
                    this.renderAdminProjectsTable();
                }
            });
        });

        // Main Image Upload & Dropzone
        this.setupMainImageUpload();

        // Gallery Images Upload & Dropzone
        this.setupGalleryImagesUpload();

        // Add Project Submission
        this.addProjectForm?.addEventListener('submit', (e) => this.handleAddProject(e));

        // Manage Gallery Sub-View
        this.backToProjectsBtn?.addEventListener('click', () => {
            this.galleryManageView.classList.remove('active');
            this.adminDashboardView.classList.add('active');
            this.renderAdminProjectsTable();
        });

        this.btnAddMoreGallery?.addEventListener('click', () => {
            this.addMoreGalleryInput.click();
        });

        this.addMoreGalleryInput?.addEventListener('change', (e) => this.handleAddMoreGalleryImages(e));

        // Edit Modal
        this.editModalClose?.addEventListener('click', () => this.closeEditModal());
        this.editModal?.addEventListener('click', (e) => {
            if (e.target === this.editModal) this.closeEditModal();
        });
        this.editProjectForm?.addEventListener('submit', (e) => this.handleEditProject(e));

        // Cloud Status Banner & SQL Modal Events
        this.btnCopySql?.addEventListener('click', () => this.openSqlModal());
        this.btnRecheckCloud?.addEventListener('click', () => {
            this.showToast("جاري فحص الاتصال بسحابة Supabase...", "info");
            this.refreshCloudStatus();
        });
        this.sqlModalClose?.addEventListener('click', () => this.closeSqlModal());
        this.btnModalCopySql?.addEventListener('click', () => this.copySqlCodeToClipboard());
        this.sqlSetupModal?.addEventListener('click', (e) => {
            if (e.target === this.sqlSetupModal) this.closeSqlModal();
        });
    }

    /**
     * Start the app
     */
    async init() {
        console.log("🚀 Initializing Ain Al Emarat Facades Catalog...");
        await this.loadProjects();
        this.handleHashChange();
        this.refreshCloudStatus();
    }

    /**
     * Load projects from Supabase Cloud
     */
    async loadProjects() {
        try {
            const cloudProjects = await window.binaService.getProjects();
            if (cloudProjects && cloudProjects.length > 0) {
                this.allProjects = cloudProjects;
            } else {
                // If cloud is empty initially, show sample facade projects
                this.allProjects = window.BINA_MOCK_PROJECTS || [];
            }
            this.updateStats();
            this.renderCatalog();
        } catch (err) {
            console.warn("Cloud projects load notice:", err);
            this.allProjects = window.BINA_MOCK_PROJECTS || [];
            this.updateStats();
            this.renderCatalog();
        }
    }

    openSqlModal() {
        if (!this.sqlSetupModal) return;
        if (this.sqlCodeTextarea) {
            this.sqlCodeTextarea.value = SUPABASE_SETUP_SQL;
        }
        this.sqlSetupModal.classList.add('active');
    }

    closeSqlModal() {
        this.sqlSetupModal?.classList.remove('active');
    }

    async copySqlCodeToClipboard() {
        try {
            await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
            this.showToast("تم نسخ كود الـ SQL بنجاح! الصقه في Supabase SQL Editor واضغط Run.", "success");
        } catch (err) {
            if (this.sqlCodeTextarea) {
                this.sqlCodeTextarea.select();
                document.execCommand('copy');
                this.showToast("تم تحديد ونسخ كود الـ SQL بنجاح!", "success");
            }
        }
    }

    async refreshCloudStatus() {
        if (!this.cloudStatusBanner) return;
        if (this.cloudStatusDesc) {
            this.cloudStatusDesc.textContent = "جاري فحص الاتصال بقاعدة البيانات وحاوية التخزين...";
        }
        try {
            const health = await window.binaService.checkCloudHealth();
            if (health.isReady) {
                this.cloudStatusBanner.style.background = "#ecfdf5";
                this.cloudStatusBanner.style.borderColor = "#a7f3d0";
                if (this.cloudStatusIcon) {
                    this.cloudStatusIcon.style.background = "#10b981";
                    this.cloudStatusIcon.innerHTML = `<i class="fa-solid fa-check"></i>`;
                }
                if (this.cloudStatusTitle) {
                    this.cloudStatusTitle.textContent = "السحابة متصلة وجاهزة بنسبة 100%!";
                    this.cloudStatusTitle.style.color = "#065f46";
                }
                if (this.cloudStatusDesc) {
                    this.cloudStatusDesc.textContent = "يتم رفع الصور وحفظ جميع بيانات العماير مباشرة في سحابة Supabase.";
                    this.cloudStatusDesc.style.color = "#047857";
                }
                if (this.btnCopySql) this.btnCopySql.style.display = "none";
            } else {
                this.cloudStatusBanner.style.background = "#fffbeb";
                this.cloudStatusBanner.style.borderColor = "#fde68a";
                if (this.cloudStatusIcon) {
                    this.cloudStatusIcon.style.background = "#f59e0b";
                    this.cloudStatusIcon.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>`;
                }
                if (this.cloudStatusTitle) {
                    this.cloudStatusTitle.textContent = "تنبيه: سحابة Supabase بحاجة لتفعيل سياسات الوصول (RLS)";
                    this.cloudStatusTitle.style.color = "#92400e";
                }
                if (this.cloudStatusDesc) {
                    this.cloudStatusDesc.textContent = health.message || "انسخ كود الـ SQL وشغله في Supabase لتفعيل رفع الصور وحفظ المشاريع في السحابة.";
                    this.cloudStatusDesc.style.color = "#b45309";
                }
                if (this.btnCopySql) this.btnCopySql.style.display = "inline-flex";
            }
        } catch (err) {
            console.warn("Cloud health check warning:", err);
        }
    }

    /**
     * Update hero statistics counters
     */
    updateStats() {
        const totalProjects = this.allProjects.length;
        const totalImages = this.allProjects.reduce((acc, p) => acc + (p.imageCount || 1), 0);

        const citiesSet = new Set();
        this.allProjects.forEach(p => {
            const parts = (p.district || '').split('-');
            const city = parts.length > 1 ? parts[parts.length - 1].trim() : p.district;
            if (city) citiesSet.add(city);
        });

        if (this.statProjectsCount) this.statProjectsCount.textContent = totalProjects;
        if (this.statImagesCount) this.statImagesCount.textContent = totalImages;
        if (this.statCitiesCount) this.statCitiesCount.textContent = Math.max(citiesSet.size, 1);
    }

    /**
     * Render Project Cards in Catalog Grid
     */
    renderCatalog() {
        if (!this.projectsGrid) return;

        let filtered = this.allProjects;

        // Apply category filter
        if (this.currentCategory && this.currentCategory !== 'الكل') {
            filtered = filtered.filter(p => {
                const combined = `${p.work_type} ${p.building_name}`.toLowerCase();
                return combined.includes(this.currentCategory.toLowerCase());
            });
        }

        // Apply text search
        if (this.searchQuery) {
            filtered = filtered.filter(p => {
                const searchCorpus = `${p.building_name} ${p.district} ${p.work_type}`.toLowerCase();
                return searchCorpus.includes(this.searchQuery);
            });
        }

        if (filtered.length === 0) {
            this.projectsGrid.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-folder-open"></i></div>
                    <h3 class="empty-title">لا توجد مشاريع مطابقة</h3>
                    <p class="empty-desc">جرب البحث بكلمات أخرى أو اختر فئة مختلفة من التصنيفات أعلاه.</p>
                </div>
            `;
            return;
        }

        this.projectsGrid.innerHTML = filtered.map(p => {
            const count = p.imageCount || 4;
            const waCardMsg = encodeURIComponent(`السلام عليكم شركة عين الإمارات، أود الاستفسار وطلب تسعير عن مشروع: "${p.building_name}" (${p.work_type} - ${p.district})`);
            return `
                <div class="project-card" data-id="${p.id}">
                    <div class="card-media">
                        <img src="${p.main_image_url}" alt="${p.building_name}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?q=80&w=600&auto=format&fit=crop'">
                        <div class="card-badges">
                            <span class="badge-work">${p.work_type}</span>
                        </div>
                        <div class="badge-photos">
                            <i class="fa-solid fa-camera"></i>
                            <span>${count} صور</span>
                        </div>
                    </div>
                    <div class="card-content">
                        <h3 class="card-title">${p.building_name}</h3>
                        <div class="card-meta">
                            <i class="fa-solid fa-location-dot"></i>
                            <span>${p.district}</span>
                        </div>
                        <div class="card-footer">
                            <button class="btn-view-gallery" onclick="window.app.openLightbox('${p.id}')">
                                <i class="fa-solid fa-images"></i>
                                <span>عرض الصور</span>
                            </button>
                            <a href="https://wa.me/966583100076?text=${waCardMsg}" target="_blank" rel="noopener" class="btn-card-whatsapp" title="استفسار وتسعير عبر واتساب (0583100076)">
                                <i class="fa-brands fa-whatsapp"></i>
                                <span>واتساب</span>
                            </a>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Open Full Gallery Lightbox Modal
     */
    async openLightbox(projectId) {
        try {
            this.showToast("جاري جلب صور المشروع المعمارية...", "info");
            const project = await window.binaService.getProjectWithImages(projectId);
            this.activeLightboxProject = project;
            this.activeImageIndex = 0;

            // Collect all images (main image + gallery images)
            const imagesList = [];
            if (project.main_image_url) {
                imagesList.push(project.main_image_url);
            }

            if (project.images && Array.isArray(project.images)) {
                project.images.forEach(img => {
                    const url = typeof img === 'string' ? img : img.image_url;
                    if (url && !imagesList.includes(url)) {
                        imagesList.push(url);
                    }
                });
            }

            this.activeLightboxImages = imagesList;

            // Populate modal texts
            if (this.galleryModalTitle) this.galleryModalTitle.textContent = project.building_name;
            if (this.galleryModalSub) {
                this.galleryModalSub.innerHTML = `
                    <i class="fa-solid fa-location-dot"></i> ${project.district} 
                    <span style="margin: 0 8px;">•</span> 
                    <i class="fa-solid fa-trowel-bricks"></i> ${project.work_type}
                `;
            }

            // Setup WhatsApp share button
            if (this.galleryWhatsappBtn) {
                const message = encodeURIComponent(`مرحباً شركة عين الإمارات، أود الاستفسار وطلب تسعير لتلبيس / ترميم واجهة بمواصفات مشابهة لمشروع "${project.building_name}" في (${project.district}) - ${project.work_type}.`);
                this.galleryWhatsappBtn.href = `https://wa.me/966583100076?text=${message}`;
            }

            // Render thumbnails strip
            this.renderLightboxThumbnails();
            this.updateLightboxImage(0);

            // Show modal
            this.galleryModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        } catch (e) {
            console.error("Open lightbox error:", e);
            this.showToast("تعذر تحميل صور المشروع.", "error");
        }
    }

    renderLightboxThumbnails() {
        if (!this.galleryThumbStrip || !this.activeLightboxImages) return;

        this.galleryThumbStrip.innerHTML = this.activeLightboxImages.map((imgUrl, idx) => `
            <div class="gallery-thumb-item ${idx === 0 ? 'active' : ''}" data-idx="${idx}" onclick="window.app.updateLightboxImage(${idx})">
                <img src="${imgUrl}" alt="صورة ${idx + 1}" onerror="this.src='https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?q=80&w=200&auto=format&fit=crop'">
            </div>
        `).join('');
    }

    updateLightboxImage(index) {
        if (!this.activeLightboxImages || this.activeLightboxImages.length === 0) return;

        this.activeImageIndex = (index + this.activeLightboxImages.length) % this.activeLightboxImages.length;
        const currentUrl = this.activeLightboxImages[this.activeImageIndex];

        if (this.galleryMainImg) {
            this.galleryMainImg.style.opacity = '0';
            setTimeout(() => {
                this.galleryMainImg.src = currentUrl;
                this.galleryMainImg.style.opacity = '1';
            }, 100);
        }

        if (this.galleryCounterTag) {
            this.galleryCounterTag.textContent = `صورة ${this.activeImageIndex + 1} من ${this.activeLightboxImages.length}`;
        }

        // Update active thumbnail
        const thumbs = this.galleryThumbStrip?.querySelectorAll('.gallery-thumb-item');
        thumbs?.forEach((t, i) => {
            if (i === this.activeImageIndex) {
                t.classList.add('active');
                t.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            } else {
                t.classList.remove('active');
            }
        });
    }

    navigateLightbox(direction) {
        this.updateLightboxImage(this.activeImageIndex + direction);
    }

    closeLightbox() {
        this.galleryModal?.classList.remove('active');
        document.body.style.overflow = '';
        this.activeLightboxProject = null;
    }

    /**
     * View Switcher (works seamlessly via double-click on file:///)
     */
    switchView(viewName) {
        this.currentView = viewName;

        // Hide all views
        this.catalogView.style.display = 'none';
        this.adminLoginView.classList.remove('active');
        this.adminDashboardView.classList.remove('active');
        this.galleryManageView.classList.remove('active');

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });

        if (viewName === 'catalog') {
            this.catalogView.style.display = 'block';
            window.location.hash = 'catalog';
        } else if (viewName === 'admin-login') {
            this.adminLoginView.classList.add('active');
            window.location.hash = 'admin-login';
        } else if (viewName === 'admin-dashboard') {
            if (!window.binaService.isAuthenticated()) {
                this.switchView('admin-login');
                return;
            }
            this.adminDashboardView.classList.add('active');
            window.location.hash = 'admin';
            const currentUser = window.binaService.getCurrentUser();
            const userDisplay = document.getElementById('admin-user-display');
            if (userDisplay && currentUser) {
                userDisplay.textContent = `المستخدم: ${currentUser.email || 'المدير المعتمد'}`;
            }
            this.renderAdminProjectsTable();
        } else if (viewName === 'gallery-manage') {
            this.galleryManageView.classList.add('active');
        }
    }

    handleAdminNav() {
        if (window.binaService.isAuthenticated()) {
            this.switchView('admin-dashboard');
        } else {
            this.switchView('admin-login');
        }
    }

    handleHashChange() {
        const hash = window.location.hash.replace('#', '');
        if (hash === 'admin') {
            if (window.binaService.isAuthenticated()) {
                this.switchView('admin-dashboard');
            } else {
                this.switchView('admin-login');
            }
        } else if (hash === 'admin-login') {
            this.switchView('admin-login');
        } else {
            this.switchView('catalog');
        }
    }

    /**
     * Admin Authentication
     */
    async handleAdminLogin(e) {
        e.preventDefault();
        const email = this.loginEmailInput.value.trim();
        const password = this.loginPasswordInput.value.trim();

        if (!email || !password) {
            this.showToast("يرجى إدخال البريد الإلكتروني وكلمة المرور.", "error");
            return;
        }

        this.showToast("جاري التحقق من بيانات الدخول...", "info");
        const res = await window.binaService.login(email, password);

        if (res.success) {
            this.showToast(res.message || "مرحباً بك في لوحة الإدارة!", "success");
            this.switchView('admin-dashboard');
        } else {
            this.showToast(res.error || "بيانات الدخول غير صحيحة.", "error");
        }
    }

    async handleAdminLogout() {
        await window.binaService.logout();
        this.showToast("تم تسجيل الخروج بنجاح.", "info");
        this.switchView('catalog');
    }

    /**
     * File Upload & Real-Time Compression Setup (Main Image)
     */
    setupMainImageUpload() {
        if (!this.mainDropzone || !this.mainImageInput) return;

        this.mainDropzone.addEventListener('click', () => this.mainImageInput.click());

        this.mainDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.mainDropzone.classList.add('dragover');
        });

        this.mainDropzone.addEventListener('dragleave', () => {
            this.mainDropzone.classList.remove('dragover');
        });

        this.mainDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.mainDropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                this.processMainImage(e.dataTransfer.files[0]);
            }
        });

        this.mainImageInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.processMainImage(e.target.files[0]);
            }
        });
    }

    async processMainImage(file) {
        try {
            this.showToast("جاري ضغط الصورة الرئيسية إلى ~350KB...", "info");
            const compressed = await window.binaCompressor.compress(file);
            this.newMainImageFile = file;

            // Render live preview & badge
            if (this.mainImagePreview) {
                this.mainImagePreview.innerHTML = `
                    <div style="position:relative; width: 100%; max-width: 280px; margin: 12px auto; height: 160px; border-radius: 12px; overflow: hidden; border: 2px solid var(--accent);">
                        <img src="${compressed.dataUrl}" style="width:100%; height:100%; object-fit:cover;">
                    </div>
                `;
            }

            if (this.mainCompressionBadge) {
                this.mainCompressionBadge.style.display = 'inline-flex';
                this.mainCompressionBadge.innerHTML = `
                    <i class="fa-solid fa-compress"></i>
                    <span>الحجم الأصلي: <strong>${compressed.originalSizeFormatted}</strong> ➡️ بعد الضغط: <strong>${compressed.compressedSizeFormatted}</strong> (توفير ${compressed.reductionPercent}%)</span>
                `;
            }

            this.showToast(`تم ضغط الصورة الرئيسية بنجاح (${compressed.compressedSizeFormatted})`, "success");
        } catch (e) {
            console.error("Main image compression error:", e);
            this.showToast("فشل ضغط الصورة المختارة.", "error");
        }
    }

    /**
     * File Upload & Batch Compression Setup (Gallery Sub-Images)
     */
    setupGalleryImagesUpload() {
        if (!this.galleryDropzone || !this.galleryImagesInput) return;

        this.galleryDropzone.addEventListener('click', () => this.galleryImagesInput.click());

        this.galleryDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.galleryDropzone.classList.add('dragover');
        });

        this.galleryDropzone.addEventListener('dragleave', () => {
            this.galleryDropzone.classList.remove('dragover');
        });

        this.galleryDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.galleryDropzone.classList.remove('dragover');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                this.processGalleryBatch(e.dataTransfer.files);
            }
        });

        this.galleryImagesInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                this.processGalleryBatch(e.target.files);
            }
        });
    }

    async processGalleryBatch(files) {
        const fileList = Array.from(files).slice(0, 30); // Support up to 30 images
        this.showToast(`جاري فحص وضغط ${fileList.length} صورة للمعرض...`, "info");

        for (const file of fileList) {
            try {
                const comp = await window.binaCompressor.compress(file);
                this.newGalleryFiles.push({
                    file: file,
                    dataUrl: comp.dataUrl,
                    compressedSizeFormatted: comp.compressedSizeFormatted,
                    reductionPercent: comp.reductionPercent
                });
            } catch (err) {
                console.error("Error compressing gallery image:", err);
            }
        }

        this.renderGalleryPreviews();
        this.showToast(`تم تجهيز وضغط صور المعرض بنجاح!`, "success");
    }

    renderGalleryPreviews() {
        if (!this.galleryPreviewsGrid) return;

        this.galleryPreviewsGrid.innerHTML = this.newGalleryFiles.map((item, idx) => `
            <div class="preview-item">
                <img src="${item.dataUrl}" alt="صورة ${idx + 1}">
                <button type="button" class="preview-remove-btn" onclick="window.app.removeGalleryPreview(${idx})">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <span class="preview-badge-size">${item.compressedSizeFormatted}</span>
            </div>
        `).join('');
    }

    removeGalleryPreview(idx) {
        this.newGalleryFiles.splice(idx, 1);
        this.renderGalleryPreviews();
    }

    /**
     * Add New Project Submission
     */
    async handleAddProject(e) {
        e.preventDefault();

        const buildingName = document.getElementById('new-building-name').value.trim();
        const district = document.getElementById('new-district').value.trim();
        const workType = document.getElementById('new-work-type').value.trim();

        if (!buildingName || !district || !workType) {
            this.showToast("يرجى إكمال جميع حقول بيانات المشروع.", "error");
            return;
        }

        if (!this.newMainImageFile) {
            this.showToast("يرجى اختيار ورفع الصورة الرئيسية للمشروع.", "error");
            return;
        }

        // Show progress UI
        this.uploadProgressBar.style.display = 'block';
        this.btnSaveProject.disabled = true;
        this.btnSaveProject.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>جاري حفظ المشروع والرفع...</span>`;

        try {
            const rawGalleryFiles = this.newGalleryFiles.map(item => item.file);

            await window.binaService.createProject(
                {
                    building_name: buildingName,
                    district: district,
                    work_type: workType
                },
                this.newMainImageFile,
                rawGalleryFiles,
                (progress) => {
                    if (this.uploadProgressStatus) this.uploadProgressStatus.textContent = progress.message;
                    const percent = Math.min(100, progress.step * 25);
                    if (this.uploadProgressFill) this.uploadProgressFill.style.width = `${percent}%`;
                    if (this.uploadProgressPercent) this.uploadProgressPercent.textContent = `${percent}%`;
                }
            );

            this.showToast("تم إنشاء المشروع وحفظه بنجاح في الكتالوج!", "success");

            // Reset form
            this.addProjectForm.reset();
            this.newMainImageFile = null;
            this.newGalleryFiles = [];
            if (this.mainImagePreview) this.mainImagePreview.innerHTML = '';
            if (this.mainCompressionBadge) this.mainCompressionBadge.style.display = 'none';
            if (this.galleryPreviewsGrid) this.galleryPreviewsGrid.innerHTML = '';

            // Reload data
            await this.loadProjects();

            // Switch to manage tab
            const manageTab = document.querySelector('.admin-tab[data-tab="manage"]');
            manageTab?.click();
        } catch (err) {
            console.error("Create project error:", err);
            this.showToast(err.message || "حدث خطأ أثناء حفظ المشروع في سحابة Supabase.", "error");
            if (err.message && (err.message.includes("supabase_setup.sql") || err.message.includes("security policy") || err.message.includes("Storage") || err.message.includes("صلاحيات"))) {
                setTimeout(() => this.openSqlModal(), 500);
            }
        } finally {
            this.uploadProgressBar.style.display = 'none';
            this.btnSaveProject.disabled = false;
            this.btnSaveProject.innerHTML = `<i class="fa-solid fa-plus-circle"></i> <span>حفظ ونشر المشروع في الكتالوج</span>`;
        }
    }

    /**
     * Render Admin Projects Management Table
     */
    renderAdminProjectsTable() {
        if (!this.adminProjectsTableBody) return;

        if (this.allProjects.length === 0) {
            this.adminProjectsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding: 30px; color: var(--text-muted);">
                        لا توجد مشاريع مضافة حالياً. يمكنك إضافة مشروعك الأول من تبويب "إضافة مشروع جديد".
                    </td>
                </tr>
            `;
            return;
        }

        this.adminProjectsTableBody.innerHTML = this.allProjects.map(p => `
            <tr>
                <td>
                    <div class="table-proj-cell">
                        <img src="${p.main_image_url}" class="table-proj-thumb" alt="${p.building_name}" onerror="this.src='https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?q=80&w=100&auto=format&fit=crop'">
                        <strong>${p.building_name}</strong>
                    </div>
                </td>
                <td>${p.district}</td>
                <td><span class="badge-work" style="background:#1e293b; color:#fff;">${p.work_type}</span></td>
                <td><strong>${p.imageCount || 0}</strong> صور</td>
                <td>${new Date(p.created_at || Date.now()).toLocaleDateString('ar-SA')}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action-icon" title="إدارة معرض الصور" onclick="window.app.openGalleryManager('${p.id}')">
                            <i class="fa-solid fa-images"></i>
                        </button>
                        <button class="btn-action-icon" title="تعديل بيانات المشروع" onclick="window.app.openEditModal('${p.id}')">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-action-icon danger" title="حذف المشروع" onclick="window.app.confirmDeleteProject('${p.id}', '${p.building_name}')">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    /**
     * Project Deletion with CASCADE Confirmation
     */
    async confirmDeleteProject(projectId, projectName) {
        const confirmed = confirm(`هل أنت متأكد من رغبتك في حذف المشروع: "${projectName}"؟\nسيتم حذف المشروع وكافة الصور الفرعية المرتبطة به تلقائياً (CASCADE).`);
        if (!confirmed) return;

        try {
            this.showToast("جاري حذف المشروع والصور التابعة له...", "info");
            await window.binaService.deleteProject(projectId);
            this.showToast("تم حذف المشروع بنجاح!", "success");
            await this.loadProjects();
            this.renderAdminProjectsTable();
        } catch (e) {
            console.error("Delete project error:", e);
            this.showToast("حدث خطأ أثناء حذف المشروع.", "error");
        }
    }

    /**
     * Open Project Edit Modal
     */
    openEditModal(projectId) {
        const project = this.allProjects.find(p => p.id === projectId);
        if (!project) return;

        if (this.editProjectId) this.editProjectId.value = project.id;
        if (this.editBuildingName) this.editBuildingName.value = project.building_name;
        if (this.editDistrict) this.editDistrict.value = project.district;
        if (this.editWorkType) this.editWorkType.value = project.work_type;
        if (this.editMainImageInput) this.editMainImageInput.value = '';

        this.editModal.classList.add('active');
    }

    closeEditModal() {
        this.editModal?.classList.remove('active');
    }

    async handleEditProject(e) {
        e.preventDefault();
        const projectId = this.editProjectId.value;
        const buildingName = this.editBuildingName.value.trim();
        const district = this.editDistrict.value.trim();
        const workType = this.editWorkType.value.trim();
        const newImageFile = this.editMainImageInput.files && this.editMainImageInput.files[0] ? this.editMainImageInput.files[0] : null;

        try {
            this.showToast("جاري حفظ التعديلات...", "info");
            await window.binaService.updateProject(projectId, {
                building_name: buildingName,
                district: district,
                work_type: workType
            }, newImageFile);

            this.showToast("تم تحديث بيانات المشروع بنجاح!", "success");
            this.closeEditModal();
            await this.loadProjects();
            this.renderAdminProjectsTable();
        } catch (err) {
            console.error("Edit project error:", err);
            this.showToast("فشل تحديث بيانات المشروع.", "error");
        }
    }

    /**
     * Dedicated Gallery Management Sub-View for a Project
     */
    async openGalleryManager(projectId) {
        try {
            this.showToast("تحميل معرض صور المشروع...", "info");
            const project = await window.binaService.getProjectWithImages(projectId);
            this.managingProjectId = projectId;
            this.managingProject = project;

            if (this.manageProjectTitle) {
                this.manageProjectTitle.textContent = `${project.building_name} (${project.district})`;
            }

            this.renderManageGalleryGrid();

            // Switch to gallery view
            this.adminDashboardView.classList.remove('active');
            this.galleryManageView.classList.add('active');
        } catch (e) {
            console.error("Error opening gallery manager:", e);
            this.showToast("فشل فتح معرض المشروع.", "error");
        }
    }

    renderManageGalleryGrid() {
        if (!this.manageGalleryGrid || !this.managingProject) return;

        const images = this.managingProject.images || [];

        if (images.length === 0) {
            this.manageGalleryGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: var(--surface-alt); border-radius: 12px;">
                    <i class="fa-solid fa-image" style="font-size: 36px; color: var(--text-muted); margin-bottom: 8px;"></i>
                    <p style="color: var(--text-muted);">لا توجد صور فرعية في هذا المعرض حالياً. يمكنك إضافة صور بالضغط على الزر أدناه.</p>
                </div>
            `;
            return;
        }

        this.manageGalleryGrid.innerHTML = images.map((img, idx) => {
            const imgId = typeof img === 'object' ? img.id : `img-${idx}`;
            const imgUrl = typeof img === 'object' ? img.image_url : img;

            return `
                <div class="gallery-manage-item">
                    <img src="${imgUrl}" alt="صورة ${idx + 1}" onerror="this.src='https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?q=80&w=300&auto=format&fit=crop'">
                    <button class="gallery-manage-delete-btn" title="حذف هذه الصورة فقط" onclick="window.app.deleteSingleGalleryImage('${imgId}')">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
        }).join('');
    }

    async deleteSingleGalleryImage(imageId) {
        if (!confirm("هل أنت متأكد من حذف هذه الصورة من المعرض؟")) return;

        try {
            await window.binaService.deleteGalleryImage(imageId);
            this.showToast("تم حذف الصورة من المعرض بنجاح!", "success");

            // Refresh current project gallery
            const updated = await window.binaService.getProjectWithImages(this.managingProjectId);
            this.managingProject = updated;
            this.renderManageGalleryGrid();
            await this.loadProjects();
        } catch (e) {
            console.error("Delete single image error:", e);
            this.showToast("حدث خطأ أثناء حذف الصورة.", "error");
        }
    }

    async handleAddMoreGalleryImages(e) {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        try {
            this.showToast(`جاري ضغط ورفع ${files.length} صورة جديدة إلى المعرض...`, "info");
            await window.binaService.addGalleryImages(this.managingProjectId, files, (p) => {
                this.showToast(p.message, "info");
            });

            this.showToast("تمت إضافة الصور الجديدة إلى المعرض بنجاح!", "success");
            this.addMoreGalleryInput.value = '';

            // Refresh
            const updated = await window.binaService.getProjectWithImages(this.managingProjectId);
            this.managingProject = updated;
            this.renderManageGalleryGrid();
            await this.loadProjects();
        } catch (err) {
            console.error("Add more gallery images error:", err);
            this.showToast("حدث خطأ أثناء رفع الصور الإضافية.", "error");
        }
    }

    /**
     * Floating Toast Notification
     */
    showToast(message, type = 'info') {
        if (!this.toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let icon = 'fa-info-circle';
        if (type === 'success') icon = 'fa-check-circle';
        if (type === 'error') icon = 'fa-triangle-exclamation';

        toast.innerHTML = `
            <i class="fa-solid ${icon}"></i>
            <span>${message}</span>
        `;

        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
}

// Instantiate on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new BinaProApp();
    window.app.init();
});
