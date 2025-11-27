# Deployment Instructions

## Option 1: Deploy on Railway (Recommended)
Since your backend is already on Railway, deploying the Admin Panel there is convenient and keeps everything in one project.

1.  **Open Railway Dashboard**.
2.  Click **New** -> **GitHub Repo**.
3.  Select the **jhaguar-backend** repository.
4.  **Configure the Service**:
    *   Go to the new service's **Settings**.
    *   **Root Directory**: Set to `admin-client`.
    *   **Build Command**: `npm run build` (should be auto-detected).
    *   **Start Command**: `npm start` (should be auto-detected).
5.  **Environment Variables**:
    *   Go to **Variables**.
    *   Add `NEXT_PUBLIC_API_URL`.
    *   Value: Your backend's production URL (e.g., `https://jhaguar-backend-production.up.railway.app`).
        *   *Tip*: You can find this URL in your Backend service settings under "Networking".

## Option 2: Deploy on Vercel
Vercel is excellent for Next.js applications.

1.  **Go to Vercel Dashboard** -> **Add New** -> **Project**.
2.  Import the **jhaguar-backend** repository.
3.  **Configure Project**:
    *   **Framework Preset**: Next.js.
    *   **Root Directory**: Click "Edit" and select `admin-client`.
4.  **Environment Variables**:
    *   Add `NEXT_PUBLIC_API_URL`.
    *   Value: Your backend's production URL.
5.  Click **Deploy**.

## Important Notes
-   **Admin Access**: We have manually enabled admin access for `lucasemanuelpribeiro@gmail.com`.
-   **Database**: The `isAdmin` column was added directly to your production database. Future migrations should be safe, but be aware that `00_add_is_admin` is now "applied" manually.
