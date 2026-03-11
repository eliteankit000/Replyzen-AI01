import { useState, useEffect, useRef } from "react";
import { billingAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Check, CreditCard, Zap, Crown, Loader2, AlertTriangle, CheckCircle, XCircle, X } from "lucide-react";

/* ── Inline banner — no Toaster dependency ── */
function Banner({ banner, onClose }) {
  if (!banner) return null;
  const isError = banner.type === "error";
  return (
    <div role="alert" style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "13px 18px", borderRadius: 10,
      background: isError ? "#fef2f2" : "#f0fdf4",
      border: `1.5px solid ${isError ? "#f87171" : "#4ade80"}`,
      color: isError ? "#7f1d1d" : "#14532d",
      fontSize: 14, fontWeight: 500,
      boxShadow: "0 2px 12px rgba(0,0,0,0.09)",
      marginBottom: 8,
    }}>
      {isError
        ? <XCircle    style={{ width: 18, height: 18, color: "#dc2626", flexShrink: 0 }} />
        : <CheckCircle style={{ width: 18, height: 18, color: "#16a34a", flexShrink: 0 }} />
      }
      <span style={{ flex: 1 }}>{banner.msg}</span>
      <button onClick={onClose} style={{ all: "unset", cursor: "pointer", opacity: 0.45, display: "flex" }} aria-label="Dismiss">
        <X style={{ width: 14, height: 14 }} />
      </button>
    </div>
  );
}

export default function Billing() {
  const { user, refreshUser } = useAuth();

  /* ── Banner state ── */
  const [banner, setBanner] = useState(null);
  const timerRef = useRef(null);
  const showBanner = (msg, type = "success") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setBanner({ msg, type });
    timerRef.current = setTimeout(() => setBanner(null), 6000);
  };
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  /* ── Data state ── */
  const [plans, setPlans]             = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [planLimits, setPlanLimits]   = useState(null);
  const [cycle, setCycle]             = useState("monthly");
  const [loading, setLoading]         = useState(true);
  const [checkingOut, setCheckingOut] = useState(null);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelling, setCancelling]   = useState(false);
  const [locationInfo, setLocationInfo] = useState({
    currency: "USD", payment_provider: "paddle", country: "US"
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      let locInfo = { currency: "USD", payment_provider: "paddle", country: "US" };
      try {
        const locRes = await billingAPI.detectLocation();
        locInfo = locRes.data;
      } catch {
        console.warn("Location detection failed, defaulting to USD/Paddle");
      }
      setLocationInfo(locInfo);

      const [plansRes, subRes, limitsRes] = await Promise.all([
        billingAPI.getPlans(locInfo.currency),
        billingAPI.getSubscription(),
        billingAPI.getPlanLimits(),
      ]);
      setPlans(plansRes.data || []);
      setSubscription(subRes.data);
      setPlanLimits(limitsRes.data);
    } catch (err) {
      console.error("Failed to load billing:", err);
      showBanner("Failed to load billing information.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (planId) => {
    const provider = locationInfo.payment_provider;
    setCheckingOut(`${planId}-${provider}`);
    try {
      const res = await billingAPI.createCheckout({
        plan_id: planId,
        billing_cycle: cycle,
        provider,
      });

      /* ── Razorpay (India) ── */
      if (res.data.provider === "razorpay") {
        if (typeof window.Razorpay === "undefined") {
          showBanner("Razorpay SDK not loaded. Please refresh and try again.", "error");
          return;
        }
        const options = {
          key: res.data.key_id,
          subscription_id: res.data.subscription_id,
          name: "Replyzen AI",
          description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan - ${cycle}`,
          handler: () => {
            showBanner("Payment successful! Your plan has been activated. ✅");
            refreshUser();
            loadData();
          },
          modal: { ondismiss: () => showBanner("Payment was cancelled.", "error") },
          theme: { color: "#ea580c" },
        };
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", () => showBanner("Payment failed. Please try again.", "error"));
        rzp.open();

      /* ── Paddle (International) ── */
      } else if (res.data.provider === "paddle") {
        if (typeof window.Paddle === "undefined") {
          showBanner("Paddle SDK not loaded. Please refresh and try again.", "error");
          return;
        }
        try {
          // ✅ FIX 1: Use import.meta.env (Vite), not process.env (CRA)
          // ✅ FIX 2: Use VITE_PADDLE_PUBLIC_KEY as token for Paddle Billing v2
          // ✅ FIX 3: Use Paddle.Initialize() not Paddle.Setup()
          if (!window.Paddle.Initialized) {
            const paddleToken = import.meta.env.VITE_PADDLE_PUBLIC_KEY;
            const vendorId    = import.meta.env.VITE_PADDLE_VENDOR_ID || res.data.vendor_id;

            if (!paddleToken && !vendorId) {
              showBanner("Paddle is not configured. Please contact support.", "error");
              return;
            }

            // Paddle Billing v2 uses Initialize + token
            // Paddle Classic uses Setup + seller (vendorId)
            if (paddleToken) {
              window.Paddle.Environment && window.Paddle.Environment.set("production");
              window.Paddle.Initialize({ token: paddleToken });
            } else {
              window.Paddle.Environment && window.Paddle.Environment.set("production");
              window.Paddle.Setup({ seller: parseInt(vendorId) });
            }
          }

          window.Paddle.Checkout.open({
            items: [{ priceId: res.data.price_id, quantity: 1 }],
            customData: { user_id: res.data.user_id, plan: planId },
            settings: {
              theme: "light",
              successUrl: window.location.href,
            },
          });
        } catch (paddleErr) {
          console.error("Paddle error:", paddleErr);
          showBanner("Unable to open Paddle checkout. Please try again.", "error");
        }
      }
    } catch (err) {
      if (err.response?.data?.detail) {
        showBanner(err.response.data.detail, "error");
      } else if (err.message === "Network Error") {
        showBanner("Unable to create checkout session. Please check your connection.", "error");
      } else {
        showBanner("Unable to create checkout session. Please try again.", "error");
      }
    } finally {
      setCheckingOut(null);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await billingAPI.cancelSubscription();
      showBanner("Subscription cancelled successfully. ✅");
      setCancelDialog(false);
      refreshUser();
      loadData();
    } catch (err) {
      showBanner(err.response?.data?.detail || "Cancellation failed. Please try again.", "error");
    } finally {
      setCancelling(false);
    }
  };

  const currentPlan    = user?.plan || subscription?.plan || "free";
  const planIcons      = { free: CreditCard, pro: Zap, business: Crown };
  const currencySymbol = locationInfo.currency === "INR" ? "₹" : "$";
  const providerLabel  = locationInfo.payment_provider === "razorpay" ? "Razorpay" : "Paddle";

  return (
    <div className="space-y-8" data-testid="billing-page">

      {/* ── Banner ── */}
      <Banner banner={banner} onClose={() => setBanner(null)} />

      <div>
        <h1 className="text-2xl font-bold" data-testid="billing-heading">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your subscription and billing</p>
      </div>

      {/* Current Plan Summary */}
      <Card data-testid="current-plan-card">
        <CardContent className="py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center shrink-0">
                {(() => { const Icon = planIcons[currentPlan] || CreditCard; return <Icon className="w-6 h-6 text-primary" />; })()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold capitalize">{currentPlan} Plan</h3>
                  <Badge className={currentPlan === "free" ? "bg-muted text-muted-foreground" : "bg-primary text-white"}>
                    {subscription?.status || "active"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {currentPlan === "free" ? "Upgrade to unlock more features" : "Your plan renews automatically"}
                </p>
                {planLimits && planLimits.followups_per_month !== -1 && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{planLimits.followups_used} / {planLimits.followups_per_month} follow-ups used this month</span>
                    </div>
                    <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min((planLimits.followups_used / planLimits.followups_per_month) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
                {planLimits && planLimits.followups_per_month === -1 && (
                  <p className="text-xs text-muted-foreground mt-1">Unlimited follow-ups</p>
                )}
              </div>
            </div>
            {currentPlan !== "free" && (
              <Button variant="outline" size="sm" onClick={() => setCancelDialog(true)} data-testid="cancel-plan-btn">
                Cancel Plan
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Location indicator */}
      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <span>Showing prices in {locationInfo.currency === "INR" ? "₹ INR" : "$ USD"}</span>
        <span className="text-muted-foreground/50">•</span>
        <span>Paying via {providerLabel}</span>
      </div>

      {/* Billing Cycle Toggle */}
      <div className="flex items-center justify-center">
        <Tabs value={cycle} onValueChange={setCycle}>
          <TabsList data-testid="billing-cycle-tabs">
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
            <TabsTrigger value="yearly">
              Yearly <Badge variant="outline" className="ml-1.5 text-xs text-primary border-primary/30">Save 17%</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[420px]" />)}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent  = plan.id === currentPlan;
            const isPopular  = plan.id === "pro";
            const price      = cycle === "yearly" ? plan.price_yearly : plan.price_monthly;
            const priceLabel = price === 0
              ? `${currencySymbol}0`
              : cycle === "yearly"
              ? `${currencySymbol}${Math.round(plan.price_yearly / 12)}`
              : `${currencySymbol}${plan.price_monthly}`;
            const isChecking = checkingOut === `${plan.id}-${locationInfo.payment_provider}`;

            return (
              <Card
                key={plan.id}
                className={`relative ${isPopular ? "border-primary ring-1 ring-primary/20 shadow-lg" : ""} ${isCurrent ? "bg-accent/30" : ""}`}
                data-testid={`billing-plan-${plan.id}`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white">Most Popular</Badge>
                )}
                <CardContent className="pt-8 pb-6">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                  <div className="mt-6 mb-6">
                    <span className="text-4xl font-bold">{priceLabel}</span>
                    <span className="text-sm text-muted-foreground">
                      {price === 0 ? " forever" : "/month"}
                    </span>
                    {cycle === "yearly" && price > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">Billed {currencySymbol}{plan.price_yearly}/year</p>
                    )}
                  </div>

                  {isCurrent ? (
                    <Button disabled className="w-full mb-6" variant="outline" data-testid={`current-plan-badge-${plan.id}`}>
                      Current Plan
                    </Button>
                  ) : plan.id === "free" ? (
                    <Button disabled className="w-full mb-6" variant="outline">Free Forever</Button>
                  ) : (
                    <div className="space-y-2 mb-6">
                      <Button
                        className="w-full bg-primary hover:bg-primary/90 text-white"
                        onClick={() => handleCheckout(plan.id)}
                        disabled={!!checkingOut}
                        data-testid={`checkout-${plan.id}`}
                      >
                        {isChecking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                        {isChecking ? "Processing..." : `Upgrade to ${plan.name}`}
                      </Button>
                    </div>
                  )}

                  <ul className="space-y-2.5">
                    {plan.features?.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" /> {feat}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cancel Dialog */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent data-testid="cancel-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Cancel Subscription
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel your {currentPlan} plan? You'll lose access to premium features at the end of your current billing period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>Keep My Plan</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling} data-testid="confirm-cancel-btn">
              {cancelling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
