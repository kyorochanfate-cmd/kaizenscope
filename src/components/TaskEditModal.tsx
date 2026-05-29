import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  MACHINE_CATEGORY_LABELS,
} from '../constants/categories';
import { deleteTask, updateTask } from '../db/tasks';
import { Resource, TaskCategory, TaskElement } from '../types';
import { formatMs } from '../utils/time';

interface Props {
  task: TaskElement | null;
  resources: Resource[];
  onClose: () => void;
  onChanged: () => void;
  onJumpToStart: (startMs: number) => void;
}

export default function TaskEditModal({
  task,
  resources,
  onClose,
  onChanged,
  onJumpToStart,
}: Props) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TaskCategory>('value_added');
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setName(task.name);
      setCategory(task.category);
      setResourceId(task.resourceId);
    }
  }, [task]);

  if (!task) return null;
  const selectedResource = resources.find((r) => r.id === resourceId);
  const isMachine = selectedResource?.type === 'machine';
  const catLabels = isMachine ? MACHINE_CATEGORY_LABELS : CATEGORY_LABELS;

  const onSave = async () => {
    if (!name.trim()) {
      Alert.alert('入力エラー', '作業名を入力してください');
      return;
    }
    if (!resourceId) {
      Alert.alert('入力エラー', 'リソースを選択してください');
      return;
    }
    setSaving(true);
    try {
      await updateTask(task.id, {
        name: name.trim(),
        category,
        resourceId,
      });
      onChanged();
      onClose();
    } catch (e: any) {
      Alert.alert('保存失敗', String(e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = () => {
    Alert.alert('削除確認', `「${task.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await deleteTask(task.id);
          onChanged();
          onClose();
        },
      },
    ]);
  };

  const onJump = () => {
    onJumpToStart(task.startTimeMs);
    onClose();
  };

  return (
    <Modal
      visible={true}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.handleBar} />
            <Text style={styles.title}>作業を編集</Text>

            <ScrollView
              style={{ maxHeight: 480 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.timeBox}>
                <Text style={styles.timeLabel}>所要時間</Text>
                <Text style={styles.timeValue}>
                  {formatMs(task.endTimeMs - task.startTimeMs)}
                </Text>
                <Text style={styles.timeSub}>
                  {formatMs(task.startTimeMs)} → {formatMs(task.endTimeMs)}
                </Text>
                <TouchableOpacity style={styles.jumpBtn} onPress={onJump}>
                  <Text style={styles.jumpBtnText}>▶ この時刻に動画を合わせる</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>作業名</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="例: ボルト締め"
              />

              <Text style={styles.label}>分類</Text>
              <View style={styles.catChipRow}>
                {CATEGORY_ORDER.map((c) => {
                  const active = category === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[
                        styles.catChip,
                        { borderColor: CATEGORY_COLORS[c] },
                        active && { backgroundColor: CATEGORY_COLORS[c] },
                      ]}
                      onPress={() => setCategory(c)}
                    >
                      <Text
                        style={[
                          styles.catChipText,
                          active
                            ? { color: '#fff' }
                            : { color: CATEGORY_COLORS[c] },
                        ]}
                      >
                        {catLabels[c]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {resources.length > 1 && (
                <>
                  <Text style={styles.label}>担当</Text>
                  <View style={styles.resourceRow}>
                    {resources.map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={[
                          styles.resourceChip,
                          resourceId === r.id && styles.resourceChipActive,
                        ]}
                        onPress={() => setResourceId(r.id)}
                      >
                        <Text
                          style={[
                            styles.resourceChipText,
                            resourceId === r.id && styles.resourceChipTextActive,
                          ]}
                        >
                          {r.type === 'person' ? '👷' : '⚙️'} {r.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
                <Text style={styles.deleteBtnText}>🗑 削除</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                onPress={onSave}
                disabled={saving}
              >
                <Text style={styles.saveBtnText}>{saving ? '保存中...' : '保存'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  handleBar: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginBottom: 12,
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 14 },
  timeBox: {
    backgroundColor: '#1f2937',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  timeLabel: { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  timeValue: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  timeSub: { fontSize: 11, color: '#9ca3af', fontVariant: ['tabular-nums'], marginTop: 4 },
  jumpBtn: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#374151',
    borderRadius: 8,
  },
  jumpBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '700', color: '#374151', marginTop: 12, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  catChipRow: { flexDirection: 'row', gap: 8 },
  catChip: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  catChipText: { fontSize: 14, fontWeight: '800' },
  resourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  resourceChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
  },
  resourceChipActive: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  resourceChipText: { fontSize: 13, color: '#374151' },
  resourceChipTextActive: { color: '#fff', fontWeight: '600' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  deleteBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
  },
  deleteBtnText: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
  },
  cancelBtnText: { color: '#374151', fontWeight: '700' },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: 10,
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
