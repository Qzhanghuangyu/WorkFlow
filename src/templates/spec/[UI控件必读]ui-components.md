# [UI控件必读] UI 控件映射约定库

> **读取必要性：UI 控件必读。**
> 本库把「UI 模式 → 指定实现」的团队经验，固化为 AI 可执行的规则。
>
> - **propose 阶段**：把 UI 大任务拆成模块控件时，每个控件先查本库；命中的按「指定实现」写进 `design.md` / `tasks.md`。
> - **apply 阶段**：实施命中本库的控件时，**必须**按其指定实现，不得自选方案。
>
> 命中本库的控件，视为 [Must Read] soul.md 信条一中「可由 AI 高效完成的 80%」。
> **未命中，或命中了「需人工裁定」条件的，不要擅自决定——按各条目要求暂停并交由用户裁定。**

---

## 使用规则（先读这一段）

1. **匹配**：按「识别特征」判断当前控件属于哪一条。
2. **标准情况**：符合条目「标准情况」的，直接采用「指定实现」。若当前项目中已有同类控件的实现，应在 `design.md` 引用它作为「参考实现」。
3. **复杂 / 变体情况**：命中条目里的「需人工裁定的情况」时，**不要自行发挥**——在 tasks/comate 中标注，并按 soul.md 的暂停约定请用户裁定后再实施。
4. 本库是「查表」，不是穷举；没有对应条目的控件按常规流程设计，不要硬套。

> **本库为通用模板。** 各条目给出的是「指定实现 + 官方标准用法」；具体参考类路径、主题色、字号等，请在接入项目时补成该项目的真实实现（见每条「本项目参考实现」占位）。

---

## Tab / 顶部分段切换 / 标签导航

- **识别特征**：一排可点击的多标签（顶部导航、分段切换、标签栏），点击标签切换下方内容区；通常与 ViewPager / ViewPager2 配合，标签下带一条移动的指示条（下划线）。

- **指定实现**：**MagicIndicator**（`hackware1993/MagicIndicator`，MIT）
  - **禁止**：不要用 `TabLayout`，不要用 `HorizontalScrollView` / `RadioGroup` 手撸标签栏。

- **官方标准用法**（依据 https://github.com/hackware1993/MagicIndicator 官方文档）：

  1. **依赖**（`build.gradle`，需 JitPack 仓库）：
     ```gradle
     repositories { maven { url 'https://jitpack.io' } }
     dependencies {
         implementation 'com.github.hackware1993:MagicIndicator:1.7.0' // androidx
         // implementation 'com.github.hackware1993:MagicIndicator:1.6.0' // support 库
     }
     ```

  2. **布局**：`MagicIndicator` 与 **ViewPager2** 上下摆放（本项目统一用 ViewPager2，不要再用旧版 `ViewPager`）：
     ```xml
     <net.lucode.hackware.magicindicator.MagicIndicator
         android:id="@+id/magic_indicator"
         android:layout_width="match_parent"
         android:layout_height="40dp" />

     <androidx.viewpager2.widget.ViewPager2
         android:id="@+id/view_pager"
         android:layout_width="match_parent"
         android:layout_height="0dp"
         android:layout_weight="1" />
     ```

  3. **代码**：`CommonNavigator` + `CommonNavigatorAdapter`，实现三个回调：
     ```kotlin
     val commonNavigator = CommonNavigator(context).apply {
         adapter = object : CommonNavigatorAdapter() {
             override fun getCount() = titleList.size

             override fun getTitleView(context: Context?, index: Int): IPagerTitleView {
                 // 官方内置：ColorTransitionPagerTitleView（选中变色）
                 // 自定义标题：实现 IPagerTitleView 或用 CommonPagerTitleView 加载自定义布局
                 return ColorTransitionPagerTitleView(context).apply {
                     normalColor = Color.GRAY
                     selectedColor = Color.BLACK
                     text = titleList[index]
                     setOnClickListener { viewPager.currentItem = index }
                 }
             }

             override fun getIndicator(context: Context?): IPagerIndicator =
                 LinePagerIndicator(context).apply {
                     mode = LinePagerIndicator.MODE_WRAP_CONTENT // 或 MODE_EXACTLY
                 }
         }
     }
     magicIndicator.navigator = commonNavigator
     ```

  4. **联动 ViewPager2（本项目默认）**：
     - ⚠️ 官方 `ViewPagerHelper.bind(...)` 只面向**旧版 `ViewPager`，本项目已弃用**，不要再用。
     - ViewPager2 没有官方 helper，用项目自带的 `ViewPager2Helper`（本质是把 VP2 的
       `OnPageChangeCallback` 转发给 `MagicIndicator` 的三个回调）：
       ```kotlin
       ViewPager2Helper.bind(magicIndicator, viewPager2)
       ```
     - 若接入项目**尚无** `ViewPager2Helper`，按下方标准实现新建一个（`util` 包下）：
       ```kotlin
       object ViewPager2Helper {
           fun bind(magicIndicator: MagicIndicator, viewPager: ViewPager2) {
               viewPager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
                   override fun onPageScrollStateChanged(state: Int) =
                       magicIndicator.onPageScrollStateChanged(state)
                   override fun onPageScrolled(position: Int, positionOffset: Float, positionOffsetPixels: Int) =
                       magicIndicator.onPageScrolled(position, positionOffset, positionOffsetPixels)
                   override fun onPageSelected(position: Int) =
                       magicIndicator.onPageSelected(position)
               })
           }
       }
       ```
     - 标题点击切页：`viewPager2.currentItem = index`（如上 `getTitleView` 所示）。
  5. **无 ViewPager2 / Fragment 切换**：不接 VP2、只切换局部视图时，用 `FragmentContainerHelper`，切换时手动调用 `handlePageSelected(index)`：
     ```kotlin
     val helper = FragmentContainerHelper(magicIndicator)
     // 切页时：helper.handlePageSelected(index)
     ```

- **关键 API 一览**：

  | 类 / 接口 | 作用 |
  | --- | --- |
  | `MagicIndicator` | 主视图，`setNavigator(...)` |
  | `CommonNavigator` | 标准导航器，`setAdapter(...)` |
  | `CommonNavigatorAdapter` | 提供标签与指示器：`getCount()` / `getTitleView()` / `getIndicator()` |
  | `IPagerTitleView` | 自定义标签接口，回调 `onEnter/onLeave/onSelected/onDeselected` |
  | `IPagerIndicator` | 自定义指示器接口，回调 `onPageSelected/onPageScrolled/...` |
  | `ColorTransitionPagerTitleView` | 内置：选中变色标签 |
  | `CommonPagerTitleView` | 加载自定义 XML 布局的标签 |
  | `LinePagerIndicator` | 内置：下划线指示器（支持 `MODE_WRAP_CONTENT`） |
  | `ViewPagerHelper` | 官方 helper，仅面向旧版 `ViewPager`——**本项目已弃用，勿用** |
  | `ViewPager2Helper` | 项目自带，`bind(indicator, viewPager2)` 与 **ViewPager2** 联动（默认用这个） |
  | `FragmentContainerHelper` | 非 ViewPager2 场景手动联动 |

- **标准情况（默认，直接用这套）**：标签数量固定、与 **ViewPager2** 一一对应、点击即切页、下划线指示条跟随滑动。
  - **本项目参考实现**：<接入项目后填该项目中一个标准的 tab+MagicIndicator 实现路径；未填写前照官方标准用法落地>

- **需人工裁定的情况（命中任一条 → 暂停交用户裁定，不要自行决定）**：
  1. **选中态字号 / 颜色跳变**：选中放大、加粗或变色（用带颜色过渡的 title view，如 `ColorTransitionPagerTitleView` 或项目自定义变体）。
  2. **标签内容非纯文本**：带角标、红点、图标、数字气泡等（用 `CommonPagerTitleView` 加载自定义布局）。
  3. **无 ViewPager2 / 手动联动**：标签只切换局部视图、不接 VP2，需要用 `FragmentContainerHelper` 手动 `handlePageSelected`。
  4. **吸顶 / 折叠联动**：indicator 需要 sticky 吸顶、或与 AppBar / NestedScroll 联动。
  5. **动态标签**：标签数量运行时增删、可横向滚动超出屏宽（`isAdjustMode` 取舍）。
  6. **自定义指示器**：非下划线样式（整块背景滑块、圆点、图片指示器等，需自实现 `IPagerIndicator`）。

- **留给人工的 20%**：指示条宽度 / 圆角 / 动效手感、选中态过渡的视觉细节、机型上的对齐微调。

---

<!-- 后续新增控件条目追加在此下方，沿用相同结构：
     识别特征 / 指定实现 / 官方标准用法 / 标准情况+本项目参考实现 / 需人工裁定的情况 / 留给人工的20% -->
