// src/types/navigation.ts
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps } from '@react-navigation/native';

/* ----------------------- BOTTOM TABS ----------------------- */
/** Bottom tab routes: Home / Progress / Diet Plan / Profile */
export type RootTabParamList = {
  Home: undefined;
  Progress: undefined;
  DietPlan: undefined;   // NEW: Diet Plan tab
  Profile: undefined;    // points to PersonalDetails in MainTabs
};

/* ------------------------- STACK --------------------------- */
/** Stack routes (includes container for tabs) */
export type RootStackParamList = {
  Auth: undefined;
  SignIn: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  Plans: undefined;

  // holds the bottom tabs (Home / Progress / Diet Plan / Profile)
  MainTabs: undefined;

  // standalone stack screens
  Player: { audioUrl: string; title: string };
  ResetPassword: undefined;
  Support: undefined;
  FAQ: undefined;

  Onboarding: undefined;
  PersonalDetails: undefined; // used in onboarding & also via Profile tab

  // NEW: screen you navigate to from Home after analysis
  MealAnalysis: {
    meal: any;                 // you can tighten this type later
    breakdown: any | null;
  };
};

/* ---------------------- Helper types ----------------------- */

export type RootStackScreenProps<Screen extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, Screen>;

export type RootTabScreenProps<Screen extends keyof RootTabParamList> =
  CompositeScreenProps<
    BottomTabScreenProps<RootTabParamList, Screen>,
    NativeStackScreenProps<RootStackParamList>
  >;
