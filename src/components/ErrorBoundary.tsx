import { Component, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, shadows, spacing } from '../theme';
import { captureException } from '../utils/telemetry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message?: string;
  stack?: string;
}

/**
 * トップレベルのエラーバウンダリ。
 * - JS で投げられた未捕捉エラーを受け止めて真っ白回避
 * - Sentry/Telemetry に送信
 * - 「やり直す」ボタンで state リセット
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || String(error),
      stack: error?.stack,
    };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    captureException(error, {
      context: 'ErrorBoundary',
      componentStack: info?.componentStack ?? undefined,
    });
  }

  reset = (): void => {
    this.setState({ hasError: false, message: undefined, stack: undefined });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.icon}>🛠</Text>
          <Text style={styles.title}>申し訳ありません</Text>
          <Text style={styles.body}>
            予期しないエラーが発生しました。{'\n'}
            「やり直す」を押すか、アプリを終了して再起動してください。
          </Text>

          {this.state.message ? (
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>エラー</Text>
              <Text style={styles.detailText} selectable>
                {this.state.message}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.btn}
            activeOpacity={0.85}
            onPress={this.reset}
          >
            <Text style={styles.btnText}>やり直す</Text>
          </TouchableOpacity>

          <Text style={styles.footer}>
            問題が続く場合は、設定画面のお問い合わせから{'\n'}
            上記のエラー内容を添えてご連絡ください。
          </Text>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: {
    padding: spacing.xl,
    paddingTop: 80,
    alignItems: 'center',
  },
  icon: { fontSize: 64, marginBottom: spacing.lg },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    marginBottom: spacing.md,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
  detailBox: {
    alignSelf: 'stretch',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    padding: 14,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.borderMuted,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textDim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: colors.danger700,
    lineHeight: 18,
  },
  btn: {
    backgroundColor: colors.primary700,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: radii.pill,
    ...shadows.floating,
    marginBottom: spacing.xl,
  },
  btnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  footer: {
    fontSize: 11,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 16,
  },
});
