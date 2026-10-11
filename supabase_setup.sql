-- ==============================================================================
-- سكربت تفعيل قاعدة بيانات ومساحة تخزين Supabase لشركة عين الإمارات
-- انسخ هذا الكود بالكامل والصقه في SQL Editor داخل لوحة تحكم Supabase ثم اضغط Run
-- ==============================================================================

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

-- إنشاء فهرس لتسريع استرجاع الصور
create index if not exists idx_project_images_project_id on public.project_images(project_id);

-- 3. تفعيل وإعداد سياسات الوصول (RLS) للجداول لتسمح بالقراءة والإضافة والتعديل والحذف
alter table public.projects enable row level security;
alter table public.project_images enable row level security;

-- سياسات جدول projects (السماح الكامل بالقراءة والإضافة والتعديل والحذف)
drop policy if exists "Allow Full Access projects" on public.projects;
drop policy if exists "Public Read Projects" on public.projects;
drop policy if exists "Allow Public Access projects" on public.projects;
create policy "Allow Public Access projects" on public.projects 
    for all 
    using (true) 
    with check (true);

-- سياسات جدول project_images
drop policy if exists "Allow Full Access project_images" on public.project_images;
drop policy if exists "Public Read Project Images" on public.project_images;
drop policy if exists "Allow Public Access project_images" on public.project_images;
create policy "Allow Public Access project_images" on public.project_images 
    for all 
    using (true) 
    with check (true);

-- 4. إنشاء وتفعيل حاوية التخزين السحابي للصور (project-images) وجعلها عامة
insert into storage.buckets (id, name, public) 
values ('project-images', 'project-images', true)
on conflict (id) do update set public = true;

-- سياسات حاوية التخزين للصور (رفع، قراءة، تعديل، حذف للجميع)
drop policy if exists "Public Access Storage" on storage.objects;
create policy "Public Access Storage" on storage.objects 
    for select using (bucket_id = 'project-images');

drop policy if exists "Allow Uploads Storage" on storage.objects;
create policy "Allow Uploads Storage" on storage.objects 
    for insert with check (bucket_id = 'project-images');

drop policy if exists "Allow Updates Storage" on storage.objects;
create policy "Allow Updates Storage" on storage.objects 
    for update using (bucket_id = 'project-images');

drop policy if exists "Allow Deletions Storage" on storage.objects;
create policy "Allow Deletions Storage" on storage.objects 
    for delete using (bucket_id = 'project-images');

-- 5. تفعيل وتأكيد بريد المدير (admin@ovrax.com) فوراً لتسجيل الدخول السحابي
update auth.users 
set email_confirmed_at = timezone('utc'::text, now()) 
where email = 'admin@ovrax.com';
