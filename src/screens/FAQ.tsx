import React, { useCallback, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  BackHandler,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackButton from '../components/BackButton';

export default function FAQ() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  // Header — match Support (transparent, no shadow, BackButton on LEFT)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: Platform.OS === 'android',
      headerTransparent: true,
      headerTitle: '',
      headerBackVisible: false,

      // Back button on the LEFT
      headerLeft: Platform.OS === 'android' ? () => <BackButton /> : null,

      // Nothing on the right
      headerRight: () => null,

      headerStyle: {
        backgroundColor: 'transparent',
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 0,
      },
      headerShadowVisible: false,
    });
  }, [navigation]);

  // Android hardware back handling (same pattern as Support)
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (!navigation.canGoBack()) {
          BackHandler.exitApp();
          return true;
        }
        return false;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => sub.remove();
    }, [navigation]),
  );

  // CalTrack FAQ content (prioritized order)
  const faqs = [
    {
      q: 'Why is the onboarding wizard important?',
      a: 'The onboarding wizard is very important because your daily targets and personalized meal plans are based on the information you provide there. Please fill it out carefully.',
    },
    {
      q: 'What if I make a mistake during onboarding or want to change my goals later?',
      a: 'You can update your goals, current weight, or height anytime from your profile settings. After making changes, tap “Save.” Your daily targets will be recalculated, and your meal plan will update from the next day.',
    },
    {
      q: 'How does CalTrack measure calories?',
      a: 'CalTrack uses standard nutrition formulas to calculate your daily targets for calories, protein, carbs, and fats. Food images are analyzed using advanced AI models to estimate the calories and nutrients as accurately as possible.',
    },
    {
      q: 'How does CalTrack track my calories?',
      a: 'During onboarding, we ask you a few questions to calculate your daily calorie target. When you upload meals, the estimated calories for each meal are subtracted from your daily target so you always know how many calories you have left for the day.',
    },
    {
      q: 'Will I get a personalized plan every day?',
      a: 'Yes. Based on your daily targets, CalTrack creates a new personalized diet plan for you each day. Any health constraints you shared during onboarding are also taken into account.',
    },
    {
      q: 'What subscription plans does CalTrack offer?',
      a: 'CalTrack offers monthly and yearly subscriptions. If you want to switch plans, you will need to cancel your current subscription, wait for it to end, and then subscribe to the new plan. This keeps the process simple and clear.',
    },
    {
      q: 'How do I upload an image?',
      a: 'Image uploads are available in the Pro plan. The free plan calculates your daily targets, but features like meal uploads, personalized meal plans, and calorie tracking are included in the Pro plan. To upload, tap the “+” button on the main screen, take a photo or select one from your gallery, then tap “Calculate Calories.” The app will estimate the calories, protein, carbs, and fats and log the meal for you.',
    },
    {
      q: 'Can I change my goal later?',
      a: 'Yes, you can change your goal anytime in your profile settings. After saving your updates, your targets will be recalculated, and your meal plan will adjust from the next day.',
    },
    {
      q: 'What is the streak (fire icon) in the header?',
      a: 'The streak shows how many consecutive days you have logged in. If you miss a day, the streak resets to 1 when you log in again.',
    },
    {
      q: 'What do the date colors on the main screen mean?',
      a: 'Dates may show different colored dotted circles or lines. Grey means you logged in but did not upload any meals that day. Red means you uploaded meals but did not meet your calorie target or you went over your target. Green means you successfully stayed within your calorie target for that day.',
    },
    {
      q: 'How is the graph on the Progress page updated?',
      a: 'You can update the graph by tapping the “Log Weight” button each day. Your recorded weight will automatically appear in the graph.',
    },
    {
      q: 'What does visual progress tracking mean?',
      a: 'You can upload your photos and tag them as “Pre” and “Post” to visually compare your progress. You can upload as many photos as you like to track your transformation over time.',
    },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: 110, // match SignIn/ForgotPassword/Support
          paddingHorizontal: 20,
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Frequently Asked Questions</Text>

        {faqs.map((item, index) => (
          <View key={index} style={styles.faqBlock}>
            <Text style={styles.question}>{`${index + 1}. ${item.q}`}</Text>
            <Text style={styles.answer}>{item.a}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  title: {
    fontSize: 20, // match SignIn/ForgotPassword/Support
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
  },
  faqBlock: {
    marginBottom: 22,
  },
  question: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  answer: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },
});
