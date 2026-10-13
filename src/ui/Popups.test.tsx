import React from 'react';
import Renderer from 'react-test-renderer';
import { Modal, Platform, Text } from 'react-native';
import { PopupHost, showActionMenu, showDialog, showPassage } from './Popups';
import { Sheet } from './Controls';
import { darkColors, lightColors, type Colors } from './theme';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let renderer: Renderer.ReactTestRenderer;
function Harness({
  colors = darkColors,
  nested = false,
}: {
  colors?: Colors;
  nested?: boolean;
}) {
  return (
    <>
      <PopupHost colors={colors} />
      <Sheet
        visible={nested}
        onClose={() => {}}
        title="Parent sheet"
        colors={colors}
      >
        <Text>Content</Text>
      </Sheet>
    </>
  );
}
const visibleHost = () =>
  renderer.root
    .findAllByType(PopupHost)
    .find(host => host.findByType(Modal).props.visible)!;
const button = (label: string) =>
  visibleHost().findByProps({ accessibilityLabel: label });
beforeEach(() =>
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' }),
);
afterEach(async () => {
  await Renderer.act(async () => renderer.unmount());
});
async function mount(props = {}) {
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness {...props} />);
  });
}
async function finishDismissal() {
  const targetHost =
    renderer.root
      .findAllByType(PopupHost)
      .find(
        host =>
          host.findByType(Modal).props.onDismiss && host.props.priority === 1,
      ) || renderer.root.findAllByType(PopupHost)[0];
  await Renderer.act(async () =>
    targetHost.findByType(Modal).props.onDismiss(),
  );
}
test('uses the visible sheet host and follows app theme changes', async () => {
  await mount({ nested: true });
  await Renderer.act(async () =>
    showDialog(
      'About the size filter',
      'File sizes are not runtime RAM requirements.',
    ),
  );
  expect(visibleHost().props.priority).toBe(1);
  expect(
    visibleHost()
      .findAllByType(Text)
      .find(node => node.props.children === 'About the size filter')!.props
      .style,
  ).toContainEqual({ color: darkColors.text });
  await Renderer.act(async () =>
    renderer.update(<Harness nested colors={lightColors} />),
  );
  expect(
    visibleHost()
      .findAllByType(Text)
      .find(node => node.props.children === 'About the size filter')!.props
      .style,
  ).toContainEqual({ color: lightColors.text });
});
test('cancelling a destructive prompt never executes its destructive action', async () => {
  await mount();
  const remove = jest.fn(),
    cancel = jest.fn();
  await Renderer.act(async () =>
    showDialog('Delete model?', 'Chats will stay.', [
      { text: 'Cancel', style: 'cancel', onPress: cancel },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]),
  );
  await Renderer.act(async () => button('Cancel').props.onPress());
  expect(remove).not.toHaveBeenCalled();
  await finishDismissal();
  expect(cancel).toHaveBeenCalledTimes(1);
});
test('iOS closes the menu before launching the chosen action', async () => {
  await mount();
  const selected = jest.fn();
  await Renderer.act(async () =>
    showActionMenu(
      {
        title: 'Add image',
        options: ['Cancel', 'Camera', 'Gallery'],
        cancelButtonIndex: 0,
      },
      selected,
    ),
  );
  await Renderer.act(async () => button('Camera').props.onPress());
  expect(selected).not.toHaveBeenCalled();
  await finishDismissal();
  expect(selected).toHaveBeenCalledWith(1);
});
test('failed asynchronous actions keep the prompt open for retry', async () => {
  await mount();
  const remove = jest
    .fn()
    .mockRejectedValueOnce(new Error('Storage unavailable'))
    .mockResolvedValue(undefined);
  await Renderer.act(async () =>
    showDialog('Delete?', 'Confirm deletion.', [
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]),
  );
  await Renderer.act(async () => button('Delete').props.onPress());
  expect(
    visibleHost()
      .findAllByType(Text)
      .some(node => node.props.children === 'Storage unavailable'),
  ).toBe(true);
  await Renderer.act(async () => button('Delete').props.onPress());
  expect(remove).toHaveBeenCalledTimes(2);
  await finishDismissal();
});
test('reference passages use a selectable scrollable sheet', async () => {
  await mount();
  await Renderer.act(async () =>
    showPassage('Biology.pdf · page 12', 'Reference text '.repeat(100)),
  );
  expect(visibleHost().findByType(Modal).props.animationType).toBe('slide');
  expect(
    visibleHost()
      .findAllByType(Text)
      .find(node => String(node.props.children).startsWith('Reference text'))!
      .props.selectable,
  ).toBe(true);
  expect(button('Done')).toBeDefined();
});

test('prevents repeated confirmation and dismissal while an async action runs', async () => {
  await mount();
  let resolve: () => void = () => {};
  const remove = jest.fn(
    () =>
      new Promise<void>(done => {
        resolve = done;
      }),
  );
  const dismissed = jest.fn();
  await Renderer.act(async () =>
    showDialog(
      'Delete?',
      'Confirm.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: remove },
      ],
      { cancelable: true, onDismiss: dismissed },
    ),
  );
  let work: Promise<void> | undefined;
  await Renderer.act(async () => {
    work = button('Delete').props.onPress();
  });
  expect(button('Delete').props.disabled).toBe(true);
  await Renderer.act(async () => {
    button('Delete').props.onPress();
    visibleHost().findByType(Modal).props.onRequestClose();
  });
  expect(remove).toHaveBeenCalledTimes(1);
  expect(dismissed).not.toHaveBeenCalled();
  await Renderer.act(async () => {
    resolve();
    await work;
  });
  await finishDismissal();
});
