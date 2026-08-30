import { cn } from "../../lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("feedbot-skeleton", className)} {...props} />;
}
