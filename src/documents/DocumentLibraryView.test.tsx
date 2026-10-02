jest.mock('./documentStore', () => ({ pickTextDocument: jest.fn() }));
import React, { useState } from 'react';
import Renderer from 'react-test-renderer';
import { DocumentLibraryView } from './DocumentLibraryView';
import { Icon } from '../ui/Icon';
import { darkColors } from '../ui/theme';
import type { DocumentController } from './useDocumentIndex';
test('row and connector toggle the same accessible document connection', async () => {
  const controller = {
    documents: [
      { id: 'document-book', name: 'Book.pdf', size: 100, pageCount: 2 },
    ],
    loaded: true,
    working: false,
    error: '',
  } as DocumentController;
  function Harness() {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <DocumentLibraryView
        controller={controller}
        colors={darkColors}
        selected={selected}
        onToggle={id =>
          setSelected(current => (current.includes(id) ? [] : [id]))
        }
      />
    );
  }
  let renderer: Renderer.ReactTestRenderer;
  await Renderer.act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  const connector = () =>
    renderer!.root.findByProps({ accessibilityLabel: 'Book.pdf connection' });
  expect(connector().props.accessibilityState.checked).toBe(false);
  expect(connector().findByType(Icon).props).toMatchObject({
    name: 'disconnected',
    color: darkColors.muted,
  });
  await Renderer.act(async () => {
    renderer!.root
      .findByProps({
        accessibilityLabel: 'Book.pdf, disconnected, tap to connect',
      })
      .props.onPress();
  });
  expect(connector().props.accessibilityState.checked).toBe(true);
  expect(connector().findByType(Icon).props).toMatchObject({
    name: 'connected',
    color: darkColors.green,
  });
  await Renderer.act(async () => {
    connector().props.onPress();
  });
  expect(connector().props.accessibilityState.checked).toBe(false);
  await Renderer.act(async () => renderer!.unmount());
});
