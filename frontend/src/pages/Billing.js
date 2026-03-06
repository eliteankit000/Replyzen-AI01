import { useState, useEffect } from "react";
import { billingAPI } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from "@/components/ui/dialog";
import { Check, CreditCard, Zap, Crown, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Billing() {
  const { user, refreshUser } = useAuth();
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [cycle, setCycle] = useState("monthly");
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(null);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [plansRes, subRes] = await Promise.all([
        billingAPI.getPlans(),
        billingAPI.getSubscription(),
      ]);
      setPlans(plansRes.data || []);
      setSubscription(subRes.data);
    } catch (err) {
      console.error("Failed to load billing:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async (planId, provider = "razorpay") => {
    setCheckingOut(planId);
    try {
      const res = await billingAPI.createCheckout({
        plan_id: planId,
        billing_cycle: cycle,
        provider,
      });

      if (res.data.provider === "razorpay") {
        // Open Razorpay checkout
        const options = {
          key: res.data.key_id,
          subscription_id: res.data.subscription_id,
          name: "Replyzen AI",
          description: `${planId.charAt(0).toUpperCase() + planId.slice(1)} Plan - ${cycle}`,
          handler: function (response) {
            toast.success("Subscription activated!");
            refreshUser();
            loadData();
          },
          theme: { color: "#ea580c" },
        };

        if (window.Razorpay) {
          const rzp = new window.Razorpay(options);
          rzp.open();
        } else {
          toast.error("Razorpay SDK not loaded. Please refresh and try again.");
        }
      } else {
        toast.info("Paddle checkout will open in a new window");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Checkout failed");
    } finally {
      setCheckingOut(null);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await billingAPI.cancelSubscription();
      toast.success("Subscription cancelled");
      setCancelDialog(false);
      refreshUser();
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Cancellation failed");
    } finally {
      setCancelling(false);
    }
  };

  const currentPlan = user?.plan || subscription?.plan || "free";
  const planIcons = { free: CreditCard, pro: Zap, business: Crown };

  return (
    <div className="space-y-8" data-testid="billing-page">
      <div>
        <h1 className="text-2xl font-bold" data-testid="billing-heading">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your subscription and billing</p>
      </div>

      {/* Current Plan */}
      <Card data-testid="current-plan-card">
        <CardContent className="py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
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

      {/* Billing Cycle Toggle */}
      <div className="flex items-center justify-center gap-4">
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
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80" />)}
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            const isPopular = plan.id === "pro";
            const price = cycle === "yearly"
              ? plan.price_yearly
              : plan.price_monthly;
            const priceLabel = price === 0
              ? "$0"
              : cycle === "yearly"
              ? `$${Math.round(plan.price_yearly / 12)}`
              : `$${plan.price_monthly}`;

            return (
              <Card
                key={plan.id}
                className={`relative ${isPopular ? "border-primary ring-1 ring-primary/20 shadow-lg" : ""} ${isCurrent ? "bg-accent/30" : ""}`}
                data-testid={`billing-plan-${plan.id}`}
              >
                {isPopular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white">Recommended</Badge>
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
                      <p className="text-xs text-muted-foreground mt-1">Billed ${plan.price_yearly}/year</p>
                    )}
                  </div>

                  {isCurrent ? (
                    <Button disabled className="w-full mb-6" variant="outline" data-testid={`current-plan-badge-${plan.id}`}>
                      Current Plan
                    </Button>
                  ) : plan.id === "free" ? (
                    <Button disabled className="w-full mb-6" variant="outline">Free</Button>
                  ) : (
                    <div className="space-y-2 mb-6">
                      <Button
                        className="w-full bg-primary hover:bg-primary/90 text-white"
                        onClick={() => handleCheckout(plan.id, "razorpay")}
                        disabled={checkingOut === plan.id}
                        data-testid={`checkout-razorpay-${plan.id}`}
                      >
                        {checkingOut === plan.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                        Pay with Razorpay
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleCheckout(plan.id, "paddle")}
                        disabled={checkingOut === plan.id}
                        data-testid={`checkout-paddle-${plan.id}`}
                      >
                        Pay with Paddle (International)
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
            <DialogTitle>Cancel Subscription</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel? You'll lose access to premium features at the end of your billing period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialog(false)}>Keep Plan</Button>
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
