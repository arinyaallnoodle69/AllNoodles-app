import { AppSidebarLayout } from "@/components/app-sidebar";
import { PageLoader } from "@/components/page-loader";

export default function DashboardLoading() {
  return (
    <AppSidebarLayout>
      <PageLoader />
    </AppSidebarLayout>
  );
}
