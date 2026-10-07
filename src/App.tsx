import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PiAuthProvider } from "@/hooks/usePiAuth";
import Index from "./pages/Index";
import Subscriptions from "./pages/Subscriptions";
import CreateSubscription from "./pages/CreateSubscription";
import MySubscriptions from "./pages/MySubscriptions";
import SellerSubscriptions from "./pages/SellerSubscriptions";
import OAuthConsent from "./pages/OAuthConsent";
import Earnings from "./pages/Earnings";
import PlatformRevenue from "./pages/PlatformRevenue";
import NotFound from "./pages/NotFound";
import AdminSellerLevels from "./pages/AdminSellerLevels";
import AdminRoute from "@/components/rewards/AdminRoute";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <PiAuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/subscriptions/create" element={<CreateSubscription />} />
            <Route path="/subscriptions/mine" element={<MySubscriptions />} />
            <Route path="/subscriptions/dashboard" element={<SellerSubscriptions />} />
            <Route path="/earnings" element={<Earnings />} />
            <Route path="/admin/revenue" element={<PlatformRevenue />} />
            <Route path="/admin/seller-levels" element={<AdminRoute><AdminSellerLevels /></AdminRoute>} />

            <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </PiAuthProvider>
  </QueryClientProvider>
);

export default App;
