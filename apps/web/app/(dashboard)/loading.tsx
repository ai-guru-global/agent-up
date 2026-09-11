import { LoadingBlock } from "@/components/ui";

/**
 * Dashboard 段的路由级加载态。此前页面切换时主区域会直接空白，
 * 用户无法判断是在加载还是页面出错了。
 */
export default function DashboardLoading() {
  return (
    <div>
      <LoadingBlock label="正在加载页面内容，请稍候" />
      <p className="mt-4 text-xs leading-relaxed text-[var(--subtle)]">
        正在从数据库读取数据。首次进入某个页面时需要即时编译，
        可能需要几秒；之后的切换会明显更快。
      </p>
    </div>
  );
}
