import { lazy, Suspense } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import AppLayout from "@/components/AppLayout";
import DocsPage   from "./pages/DocsPage";
import GuidesPage from "./pages/GuidesPage";
import BlogPage   from "./pages/BlogPage";

// Existing pages
const LandingPage    = lazy(() => import("@/pages/LandingPage"));
const LoginPage      = lazy(() => import("@/pages/LoginPage"));
const AuthCallback   = lazy(() => import("@/pages/AuthCallback"));
const Billing        = lazy(() => import("@/pages/Billing"));
const PrivacyPolicy  = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const Admin          = lazy(() => import("@/pages/Admin"));
const Support        = lazy(() => import("@/pages/Support"));
const Contact        = lazy(() => import("@/pages/Contact"));

// AI Inbox Operating System - Core Pages
const ActionCenter       = lazy(() => import("@/pages/ActionCenter"));       // Dashboard
const AIInbox            = lazy(() => import("@/pages/AIInbox"));            // Main Inbox
const EmailComposer      = lazy(() => import("@/pages/EmailComposer"));      // Composer
const IntelligenceCenter = lazy(() => import("@/pages/IntelligenceCenter")); // Analytics
const AIControlCenter    = lazy(() => import("@/pages/AIControlCenter"));    // Settings

// ✅ NEW: SEO pages (lazy loaded, zero impact on existing bundle)
const AIFollowUpGenerator  = lazy(() => import("@/pages/seo/AIFollowUpGenerator"));
const EmailAutomationAI    = lazy(() => import("@/pages/seo/EmailAutomationAI"));
const ClientNotReplying    = lazy(() => import("@/pages/seo/ClientNotReplying"));
const MissedFollowUpEmails = lazy(() => import("@/pages/seo/MissedFollowUpEmails"));

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <LoadingFallback />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            {/* Public routes — unchanged */}
            <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/support" element={<Support />} />
            <Route path="/contact" element={<Contact />} />
             <Route path="/docs"   element={<DocsPage />} />
             <Route path="/guides" element={<GuidesPage />} />
             <Route path="/blog"   element={<BlogPage />} />

            {/* Google OAuth callback */}
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* ✅ NEW: SEO pages — fully public, no auth required */}
            <Route path="/features/ai-follow-up-generator" element={<AIFollowUpGenerator />} />
            <Route path="/features/email-automation-ai"    element={<EmailAutomationAI />} />
            <Route path="/problems/client-not-replying"    element={<ClientNotReplying />} />
            <Route path="/problems/missed-follow-up-emails" element={<MissedFollowUpEmails />} />

            {/* Protected routes - AI Inbox Operating System */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard"      element={<ActionCenter />} />
              <Route path="/inbox"          element={<AIInbox />} />
              <Route path="/compose"        element={<EmailComposer />} />
              <Route path="/analytics"      element={<IntelligenceCenter />} />
              <Route path="/control-center" element={<AIControlCenter />} />
              <Route path="/billing"        element={<Billing />} />
              <Route path="/admin"          element={<Admin />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
