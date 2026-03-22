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
import { Check, CreditCard, Zap, Crown, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

// ✅ FIX: This is a CRA app — import.meta.env is Vite-only and always undefined here.
// Only process.env.REACT_APP_* works in CRA.
const PADDLE_TOKEN  = process.env.REACT_APP_PADDLE_PUBLIC_KEY  || "";
const PADDLE_VENDOR = process.env.REACT_APP_PADDLE_VENDOR_ID   || "";

export default function Billing() {
  const { user, refreshUser } = useAuth();

  const [plans, setPlans]               = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [planLimits, setPlanLimits]     = useState(null);
  const [cycle, setCycle]               = useState("monthly");
  const [loading, setLoading]           = useState(true);
  const [checkingOut, setCheckingOut]   = useState(null);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelling, setCancelling]     = useState(false);
  const [locationInfo, setLocationInfo] = useState({
    currency: "USD", payment_provider: "paddle", country: "US"
  });
  const [paddleReady, setPaddleReady] = useState(false);

  useEffect(() => {
    loadData();
    waitForPaddleAndInit();
  }, []);

  // ✅ FIX: Robust Paddle initialization that uses vendor_id from backend
  // as the primary source of truth — no env var required on frontend.
  const waitForPaddleAndInit = (vendorIdOverride) => {
    if (typeof window === "undefined") return;

    const token  = PADDLE_TOKEN;
    const vendor = vendorIdOverride || PADDLE_VENDOR;

    // If nothing to init, wait until checkout to try again with backend data
    if (!token && !vendor) return;

    const check = setInterval(() => {
      if (window.Paddle) {
        clearInterval(check);
        try {
          if (window.Paddle.Environment) {
            window.Paddle.Environment.set("production");
          }
          if (token) {
            window.Paddle.Initialize({ token });
          } else if (vendor) {
            window.Paddle.Setup({ seller: parseInt(vendor, 10) });
          }
          setPaddleReady(true);
        } catch (err) {
          console.warn("Paddle init error:", err);
        }
      }
    }, 150);

    setTimeout(() => clearInterval(check), 10000);
  };

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
      await refreshUser();
    } catch (err) {
      console.error("Failed to load billing:", err);
      toast.error("Failed to load billing information");
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (planId) => {
    const provider = locationInfo.payment_provider;
    setCheckingOut(`${planId}-${provider}`);

    try {
      const res = await billingAPI.createCheckout({
        plan_id:       planId,
        billing_cycle: cycle,
        provider,
      });

      // ── Razorpay (India) ──────────────────────────────────────────
      if (res.data.provider === "razorpay") {
        if (typeof window.Razorpay === "undefined") {
          toast.error("Razorpay SDK not loaded. Please refresh and try again.");
          return;
        }
        toast.info("Opening Razorpay checkout...");
        const options = {
          key:             res.data.key_id,
          subscription_id: res.data.subscription_id,
          name:            "ReplyZen AI",
          description:     `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan – ${cycle}`,
          handler: () => {
            toast.success("Payment successful! Your plan has been activated. 🎉");
            refreshUser();
            loadData();
          },
          modal: { ondismiss: () => toast.warning("Payment was cancelled") },
          theme: { color: "#ea580c" },
        };
        const rzp = new window.Razorpay(options);
        rzp.on("payment.failed", () => toast.error("Payment failed. Please try again."));
        rzp.open();
        return;
      }

      // ── Paddle (International) ────────────────────────────────────
      if (res.data.provider === "paddle") {
        if (typeof window.Paddle === "undefined") {
          toast.error("Paddle SDK not loaded. Please refresh and try again.");
          return;
        }

        // ✅ FIX: Use vendor_id from backend response as primary source.
        // This is what the backend reads from PADDLE_VENDOR_ID env var on Railway.
        const vendorFromBackend = res.data.vendor_id;
        const priceId           = res.data.price_id;

        if (!priceId) {
          toast.error("Paddle price not configured. Please contact support.");
          return;
        }

        // Init Paddle now if not yet done (using backend vendor_id)
        if (!paddleReady) {
          try {
            if (window.Paddle.Environment) {
              window.Paddle.Environment.set("production");
            }
            if (PADDLE_TOKEN) {
              window.Paddle.Initialize({ token: PADDLE_TOKEN });
            } else if (vendorFromBackend) {
              window.Paddle.Setup({ seller: parseInt(vendorFromBackend, 10) });
            } else if (PADDLE_VENDOR) {
              window.Paddle.Setup({ seller: parseInt(PADDLE_VENDOR, 10) });
            } else {
              toast.error("Paddle is not configured. Please contact support.");
              return;
            }
            setPaddleReady(true);
          } catch (initErr) {
            console.error("Paddle init failed:", initErr);
            toast.error("Failed to initialize payment. Please refresh and try again.");
            return;
          }
        }

        toast.info("Opening Paddle checkout...");

        try {
          window.Paddle.Checkout.open({
            items: [{ priceId, quantity: 1 }],
            customData: {
              user_id:      res.data.user_id,
              plan:         planId,
              billing_cycle: cycle,
            },
            settings: {
              theme:       "light",
              displayMode: "overlay",
              locale:      "en",
              successUrl:  window.location.href + "?payment=success",
              allowLogout: false,
            },
            customer: {
              email: user?.email || undefined,
            },
          });
        } catch (paddleErr) {
          console.error("Paddle checkout error:", paddleErr);
          toast.error("Unable to open checkout. Please try again.");
        }
      }

    } catch (err) {
      console.error("Checkout error:", err);
      const detail = err.response?.data?.detail;
      if (detail) {
        toast.error(detail);
      } else if (err.message === "Network Error") {
        toast.error("Unable to create checkout session. Please check your connection.");
      } else {
        toast.error("Unable to create checkout session. Please try again.");
      }
    } finally {
      setCheckingOut(null);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await billingAPI.cancelSubscription();
      toast.success("Subscription cancelled successfully");
      setCancelDialog(false);
      refreshUser();
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Cancellation failed. Please try again.");
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      toast.success("Payment successful! Your subscription is now active. 🎉");
      window.history.replaceState({}, document.title, window.location.pathname);
      refreshUser();
      loadData();
    }
  }, []);

  const currentPlan    = subscription?.plan || user?.plan || "free";
  const planIcons      = { free: CreditCard, pro: Zap, business: Crown };
  const currencySymbol = locationInfo.currency === "INR" ? "₹" : "$";
  const providerLabel  = locationInfo.payment_provider === "razorpay" ? "Razorpay" : "Paddle";

  return (
    <div className="space-y-8" data-testid="billing-page">

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
                    <p className="text-xs text-muted-foreground">
                      {planLimits.followups_used ?? 0} / {planLimits.followups_per_month} follow-ups used this month
                    </p>
                    <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${Math.min(
                            ((planLimits.followups_used ?? 0) / planLimits.followups_per_month) * 100,
                            100
                          )}%`
                        }}
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
              Yearly{" "}
              <Badge variant="outline" className="ml-1.5 text-xs text-primary border-primary/30">
                Save 17%
              </Badge>
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
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white">
                    Most Popular
                  </Badge>
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
                      <p className="text-xs text-muted-foreground mt-1">
                        Billed {currencySymbol}{plan.price_yearly}/year
                      </p>
                    )}
                  </div>

                  {isCurrent ? (
                    <Button disabled className="w-full mb-6" variant="outline" data-testid={`current-plan-badge-${plan.id}`}>
                      Current Plan
                    </Button>
                  ) : plan.id === "free" ? (
                    <Button disabled className="w-full mb-6" variant="outline">Free Forever</Button>
                  ) : (
                    <Button
                      className="w-full mb-6 bg-primary hover:bg-primary/90 text-white"
                      onClick={() => handleCheckout(plan.id)}
                      disabled={!!checkingOut}
                      data-testid={`checkout-${plan.id}`}
                    >
                      {isChecking
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</>
                        : <><CreditCard className="w-4 h-4 mr-2" />Upgrade to {plan.name}</>}
                    </Button>
                  )}

                  <ul className="space-y-2.5">
                    {plan.features?.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                        {feat}
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
              Are you sure you want to cancel your {currentPlan} plan? You'll lose access to
              premium features at the end of your current billing period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>Keep My Plan</Button>
            <Button variant="destructive" onClick={handleCancel} disabled={cancelling} data-testid="confirm-cancel-btn">
              {cancelling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Yes, Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
