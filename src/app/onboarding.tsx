import { useRouter } from "expo-router";
import { useEffect, useState, type ComponentType } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { TextLink } from "@/components/TextLink";
import { VeyaLogo } from "@/components/VeyaLogo";
import { FeaturesArt } from "@/components/onboarding/FeaturesArt";
import { WelcomeIllustration } from "@/components/onboarding/WelcomeIllustration";
import { IdeationArt } from "@/components/onboarding/IdeationArt";
import { LaunchArt } from "@/components/onboarding/LaunchArt";
import { ManagementArt } from "@/components/onboarding/ManagementArt";
import { StepTrio, type OnboardingStep } from "@/components/onboarding/StepTrio";
import { haptics } from "@/lib/haptics";
import { useAuth } from "@/lib/auth";
import { usePreferencesStore, type AuthEntry } from "@/stores/preferencesStore";
import { colors, screenGutter, spacing, themed } from "@/theme";

type ArtProps = { size: number; active: boolean };

type Page = {
  key: string;
  title: string;
  highlight: string;
  description: string;
  Art: ComponentType<ArtProps>;
  steps: readonly OnboardingStep[];
  /** Ambient light behind this page; cross-fades as the user swipes. */
  glow: string;
};

const PAGES: Page[] = [
  {
    key: "ideation",
    title: "Think beyond",
    highlight: "the obvious.",
    description:
      "Every breakthrough begins with a thought. Explore problems, experiment with possibilities, and brainstorm your next hackathon idea. With VEYA, there's no limit to where your imagination can take you.",
    Art: IdeationArt,
    steps: [
      { icon: "target", label: "Explore", caption: "Dig into real problems." },
      { icon: "star", label: "Experiment", caption: "Try new possibilities." },
      { icon: "idea", label: "Brainstorm", caption: "Find your next big idea." },
    ],
    glow: themed("radial-gradient(circle at 50% 30%, rgba(124, 58, 237, 0.34) 0%, rgba(30, 27, 75, 0.25) 35%, rgba(8, 8, 12, 0) 65%)"),
  },
  {
    key: "management",
    title: "Your thoughts,",
    highlight: "all in one place.",
    description:
      "Talk freely, explore your ideas, and let VEYA organise everything. Never worry about forgetting a thought. Revisit your ideas, understand how to implement them, explore technical approaches, and get a structured project plan with a ready-to-use README.md.",
    Art: ManagementArt,
    steps: [
      { icon: "mic", label: "Talk", caption: "Speak freely, no typing." },
      { icon: "folder", label: "Organise", caption: "Every thought, sorted." },
      { icon: "document", label: "Plan", caption: "Steps, approach & README." },
    ],
    glow: themed("radial-gradient(circle at 20% 25%, rgba(77, 139, 255, 0.18) 0%, rgba(124, 58, 237, 0.2) 30%, rgba(8, 8, 12, 0) 65%)"),
  },
  {
    key: "features",
    title: "Everything clicks",
    highlight: "into place.",
    description:
      "From multilingual voice conversations to AI-powered ideation, technical guidance, workflow diagrams, and concept generation, VEYA brings the tools you need to move from an initial thought to a project you can actually build.",
    Art: FeaturesArt,
    steps: [
      { icon: "language", label: "Speak", caption: "In your own language." },
      { icon: "sparkle", label: "Ideate", caption: "AI-powered concepts." },
      { icon: "build", label: "Guide", caption: "Diagrams & tech help." },
    ],
    glow: themed("radial-gradient(circle at 80% 30%, rgba(167, 139, 250, 0.3) 0%, rgba(30, 27, 75, 0.25) 35%, rgba(8, 8, 12, 0) 65%)"),
  },
  {
    key: "launch",
    title: "Make your ideas",
    highlight: "happen.",
    description:
      "Your next great project could begin with a simple conversation. Start thinking, exploring, and building with VEYA. The next move is yours.",
    Art: LaunchArt,
    steps: [
      { icon: "mic", label: "Speak", caption: "Share your idea naturally." },
      { icon: "checklist", label: "Plan", caption: "Get an intelligent execution plan." },
      { icon: "build", label: "Build", caption: "Track progress and make it happen." },
    ],
    glow: themed("radial-gradient(ellipse 90% 55% at 50% 45%, rgba(196, 181, 253, 0.28) 0%, rgba(124, 58, 237, 0.22) 30%, rgba(8, 8, 12, 0) 70%)"),
  },
];

/** The final "Get Started" page comes after the four story pages. */
const FINALE_INDEX = PAGES.length;
const PAGE_COUNT = PAGES.length + 1;
const LAST_PAGE = PAGE_COUNT - 1;
const FINALE_GLOW =
  themed("radial-gradient(circle at 50% 42%, rgba(221, 214, 254, 0.3) 0%, rgba(124, 58, 237, 0.3) 28%, rgba(30, 27, 75, 0.2) 50%, rgba(8, 8, 12, 0) 72%)");
const MAX_ART_SIZE = 360;
/** How long a user can linger on a page before it peeks toward the next one. */
const IDLE_DELAY_MS = 3500;
/** How often the page peeks while the user stays idle. */
const PEEK_INTERVAL_MS = 3200;

/** Interpolation input for "this page is centred" ± one page. */
function pageRange(index: number, width: number) {
  "worklet";
  return [(index - 1) * width, index * width, (index + 1) * width];
}

function AmbientGlow({ index, glow, width, scrollX }: { index: number; glow: string; width: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.get(), pageRange(index, width), [0, 1, 0], Extrapolation.CLAMP),
  }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundImage: glow }, style]} />;
}

type Layout = { width: number; compact: boolean };

/** Shorter phones get tighter spacing and slightly smaller type so nothing is clipped. */
function layoutStyles({ compact }: Layout) {
  return compact ? compactStyles : regularStyles;
}

type OnboardingPageProps = { page: Page; index: number; layout: Layout; scrollX: SharedValue<number>; active: boolean };

function OnboardingPage({ page, index, layout, scrollX, active }: OnboardingPageProps) {
  const { width } = layout;
  const sized = layoutStyles(layout);
  const [artSize, setArtSize] = useState(0);
  const { Art } = page;

  const artStyle = useAnimatedStyle(() => {
    const range = pageRange(index, width);
    return {
      opacity: interpolate(scrollX.get(), range, [0.2, 1, 0.2], Extrapolation.CLAMP),
      transform: [
        { translateX: interpolate(scrollX.get(), range, [width * 0.18, 0, -width * 0.18], Extrapolation.CLAMP) },
        { scale: interpolate(scrollX.get(), range, [0.82, 1, 0.82], Extrapolation.CLAMP) },
      ],
    };
  });
  // Copy moves faster than the art for a layered parallax feel.
  const copyStyle = useAnimatedStyle(() => {
    const range = pageRange(index, width);
    return {
      opacity: interpolate(scrollX.get(), range, [0, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(scrollX.get(), range, [width * 0.35, 0, -width * 0.35], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={[styles.page, sized.page, { width }]}>
      <Animated.View style={[styles.copy, copyStyle]}>
        <AppText variant="h1" align="center" accessibilityRole="header" style={sized.heading}>
          {page.title}
          {"\n"}
          <AppText variant="h1" tone="accent" style={sized.heading}>
            {page.highlight}
          </AppText>
        </AppText>
        <AppText variant="bodyMedium" tone="secondary" align="center" style={[styles.description, sized.description]}>
          {page.description}
        </AppText>
      </Animated.View>

      <Animated.View
        style={[styles.art, artStyle]}
        onLayout={(event) => {
          const { width: w, height: h } = event.nativeEvent.layout;
          setArtSize(Math.floor(Math.min(w, h, MAX_ART_SIZE)));
        }}
      >
        {artSize > 0 ? <Art size={artSize} active={active} /> : null}
      </Animated.View>

      <Animated.View style={[styles.steps, copyStyle]}>
        <StepTrio steps={page.steps} />
      </Animated.View>
    </View>
  );
}

type FinalePageProps = {
  index: number;
  layout: Layout;
  scrollX: SharedValue<number>;
  active: boolean;
  onCreateAccount: () => void;
  onLogin: () => void;
};

/** Page 5 — "Let's get started": a welcome illustration and the two ways in. */
function FinalePage({ index, layout, scrollX, active, onCreateAccount, onLogin }: FinalePageProps) {
  const { width } = layout;
  const sized = layoutStyles(layout);
  const [artSize, setArtSize] = useState(0);

  const artStyle = useAnimatedStyle(() => {
    const range = pageRange(index, width);
    return {
      opacity: interpolate(scrollX.get(), range, [0.2, 1, 0.2], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(scrollX.get(), range, [0.8, 1, 0.8], Extrapolation.CLAMP) }],
    };
  });
  const copyStyle = useAnimatedStyle(() => {
    const range = pageRange(index, width);
    return {
      opacity: interpolate(scrollX.get(), range, [0, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateX: interpolate(scrollX.get(), range, [width * 0.35, 0, -width * 0.35], Extrapolation.CLAMP) }],
    };
  });
  // The actions rise into place as the page settles.
  const actionsStyle = useAnimatedStyle(() => {
    const range = pageRange(index, width);
    return {
      opacity: interpolate(scrollX.get(), range, [0, 1, 0], Extrapolation.CLAMP),
      transform: [{ translateY: interpolate(scrollX.get(), range, [40, 0, 40], Extrapolation.CLAMP) }],
    };
  });

  return (
    <View style={[styles.page, sized.page, { width }]}>
      <Animated.View
        style={[styles.art, artStyle]}
        onLayout={(event) => {
          const { width: w, height: h } = event.nativeEvent.layout;
          setArtSize(Math.floor(Math.min(w, h, MAX_ART_SIZE)));
        }}
      >
        {artSize > 0 ? <WelcomeIllustration size={artSize} active={active} /> : null}
      </Animated.View>

      <Animated.View style={[styles.copy, copyStyle]}>
        <AppText variant="h1" align="center" accessibilityRole="header" style={sized.heading}>
          Let&apos;s get started
        </AppText>
        <AppText variant="bodyMedium" tone="secondary" align="center" style={[styles.description, sized.description]}>
          Never a better time than now to start turning your thoughts into projects you can actually build.
        </AppText>
      </Animated.View>

      <Animated.View style={[styles.finaleActions, actionsStyle]}>
        <Button label="Create Account" size="large" onPress={onCreateAccount} style={styles.finaleButton} />
        <TextLink label="Login to Account" onPress={onLogin} style={styles.finaleLink} />
      </Animated.View>
    </View>
  );
}

type ProgressDotProps = { index: number; width: number; scrollX: SharedValue<number> };

/** Progress indicator only — moving between pages is done by swiping. */
function ProgressDot({ index, width, scrollX }: ProgressDotProps) {
  const style = useAnimatedStyle(() => {
    const range = pageRange(index, width);
    return {
      width: interpolate(scrollX.get(), range, [7, 26, 7], Extrapolation.CLAMP),
      opacity: interpolate(scrollX.get(), range, [0.35, 1, 0.35], Extrapolation.CLAMP),
    };
  });
  return (
    <View style={styles.dotTarget}>
      <Animated.View style={[styles.dot, style]} />
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const completeOnboarding = usePreferencesStore((state) => state.completeOnboarding);
  const { isSignedIn, signOut } = useAuth();
  const { width, height } = useWindowDimensions();
  const layout: Layout = { width, compact: height < 760 };
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const reduceMotion = useReducedMotion();
  const [activePage, setActivePage] = useState(0);
  const [idle, setIdle] = useState(false);
  const isLastPage = activePage === LAST_PAGE;

  const endIdle = () => setIdle(false);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.set(event.contentOffset.x);
    },
    // Any touch on the pager means the user has found the gesture.
    onBeginDrag: () => {
      scheduleOnRN(endIdle);
    },
  });

  const handlePageChange = (page: number) => {
    setActivePage(page);
    setIdle(false);
    haptics.selection();
  };

  // If the user lingers on a story page, start the swipe demonstration.
  useEffect(() => {
    if (isLastPage || idle) return;
    const timer = setTimeout(() => setIdle(true), IDLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activePage, idle, isLastPage]);

  // While idle, briefly peek toward the next page to show that the pages swipe.
  useEffect(() => {
    if (!idle || reduceMotion) return;
    const restX = activePage * width;
    let settle: ReturnType<typeof setTimeout> | undefined;
    const peek = () => {
      scrollRef.current?.scrollTo({ x: restX + width * 0.14, animated: true });
      settle = setTimeout(() => scrollRef.current?.scrollTo({ x: restX, animated: true }), 450);
    };
    const first = setTimeout(peek, 350);
    const repeat = setInterval(peek, PEEK_INTERVAL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(repeat);
      if (settle) clearTimeout(settle);
    };
  }, [activePage, idle, reduceMotion, scrollRef, width]);

  // Update the active page as soon as a swipe crosses the halfway point.
  useAnimatedReaction(
    () => Math.max(0, Math.min(LAST_PAGE, Math.round(scrollX.get() / width))),
    (page, previous) => {
      if (previous !== null && page !== previous) scheduleOnRN(handlePageChange, page);
    },
    [width],
  );

  // Completing or skipping flips the route guard; replace keeps it immediate.
  /**
   * Leaves onboarding. Auth screens are guarded until onboarding is marked
   * complete, and that only takes effect on the next render — navigating to
   * them directly here would be blocked. Instead we record the destination and
   * go to the entry route ("/", always allowed), which redirects once the
   * guards have updated.
   *
   * `authEntry` is set when the user explicitly picks Create Account / Login;
   * Skip leaves it unset so a signed-in user goes straight back into the app.
   */
  const finish = async (authEntry?: AuthEntry) => {
    if (authEntry && isSignedIn) await signOut();
    completeOnboarding(authEntry);
    router.replace("/");
  };

  const skipStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.get(), [(LAST_PAGE - 1) * width, LAST_PAGE * width], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.root}>
      {PAGES.map((page, index) => (
        <AmbientGlow key={page.key} index={index} glow={page.glow} width={width} scrollX={scrollX} />
      ))}
      <AmbientGlow index={FINALE_INDEX} glow={FINALE_GLOW} width={width} scrollX={scrollX} />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <VeyaLogo size="medium" />
          <Animated.View style={[styles.skip, skipStyle]} pointerEvents={isLastPage ? "none" : "auto"}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip onboarding"
              onPress={() => void finish()}
              hitSlop={12}
              style={styles.skipButton}
            >
              <AppText variant="bodyLarge" tone="secondary">
                Skip
              </AppText>
            </Pressable>
          </Animated.View>
        </View>

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          style={styles.pager}
        >
          {PAGES.map((page, index) => (
            <OnboardingPage
              key={page.key}
              page={page}
              index={index}
              layout={layout}
              scrollX={scrollX}
              active={index === activePage}
            />
          ))}
          <FinalePage
            index={FINALE_INDEX}
            layout={layout}
            scrollX={scrollX}
            active={activePage === FINALE_INDEX}
            onCreateAccount={() => void finish("sign-up")}
            onLogin={() => void finish("sign-in")}
          />
        </Animated.ScrollView>

        <View style={styles.footer}>
          <View
            style={styles.dots}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`Page ${activePage + 1} of ${PAGE_COUNT}`}
          >
            {Array.from({ length: PAGE_COUNT }, (_, index) => (
              <ProgressDot key={index} index={index} width={width} scrollX={scrollX} />
            ))}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.veya.background },
  safe: { flex: 1 },
  header: { height: 52, alignItems: "center", justifyContent: "center", paddingHorizontal: screenGutter },
  skip: { position: "absolute", right: screenGutter },
  skipButton: { minHeight: 44, justifyContent: "center" },
  pager: { flex: 1 },
  page: { flex: 1, paddingHorizontal: screenGutter },
  copy: { gap: spacing[3] },
  description: { maxWidth: 340, alignSelf: "center" },
  // minHeight 0 lets the artwork shrink to whatever space is left, so pages never overflow.
  art: { flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", marginVertical: spacing[2] },
  steps: { paddingBottom: spacing[2] },
  finaleActions: { marginTop: spacing[6], paddingBottom: spacing[2], alignItems: "center", gap: spacing[3] },
  finaleButton: { alignSelf: "stretch" },
  finaleLink: { minHeight: 40 },
  footer: { paddingHorizontal: screenGutter, paddingTop: spacing[2], paddingBottom: spacing[3] },
  dots: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 2 },
  dotTarget: { minWidth: 22, minHeight: 24, alignItems: "center", justifyContent: "center" },
  dot: { height: 7, borderRadius: 4, backgroundColor: colors.veya.lavender },
});

const regularStyles = StyleSheet.create({
  page: { paddingTop: spacing[8] },
  heading: { fontSize: 32, lineHeight: 38 },
  description: { fontSize: 15, lineHeight: 22 },
});

const compactStyles = StyleSheet.create({
  page: { paddingTop: spacing[3] },
  heading: { fontSize: 27, lineHeight: 32 },
  description: { fontSize: 13.5, lineHeight: 19 },
});
