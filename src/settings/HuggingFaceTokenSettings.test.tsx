import React from 'react';
import Renderer from 'react-test-renderer';
import { HuggingFaceTokenSettings } from './HuggingFaceTokenSettings';
import { darkColors } from '../ui/theme';
test('masks, validates, applies, and removes the shared token', async () => {
  const apply = jest.fn();
  let renderer: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(
      <HuggingFaceTokenSettings token="" onApply={apply} colors={darkColors} />,
    );
  });
  const field = () =>
    renderer!.root.findByProps({ accessibilityLabel: 'Hugging Face token' });
  expect(field().props.secureTextEntry).toBe(true);
  await Renderer.act(async () => {
    field().props.onChangeText('invalid');
  });
  await Renderer.act(async () => {
    renderer!.root.findByProps({ label: 'Apply token' }).props.onPress();
  });
  expect(apply).not.toHaveBeenCalled();
  await Renderer.act(async () => {
    field().props.onChangeText(' hf_read ');
  });
  await Renderer.act(async () => {
    renderer!.root.findByProps({ label: 'Apply token' }).props.onPress();
  });
  expect(apply).toHaveBeenLastCalledWith('hf_read');
  await Renderer.act(async () => {
    renderer!.root.findByProps({ label: 'Remove token' }).props.onPress();
  });
  expect(apply).toHaveBeenLastCalledWith('');
  expect(field().props.value).toBe('');
  await Renderer.act(async () => renderer!.unmount());
});
