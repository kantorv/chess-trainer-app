import { render, screen, fireEvent } from '@testing-library/react';
import { useOpenings } from '../../views/tools/openings/useOpenings';
import OpeningsPanel from '../../views/tools/openings/OpeningsPanel';
import { KNOWN_MOVE_ARROW_COLOR } from '../../lib/openings';

describe('Openings functionality', () => {
  it('should highlight the hovered move arrow', () => {
    const mockState = {
      tree: {
        root: {
          id: '1',
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          children: [],
        },
        nodes: {
          '1': {
            id: '1',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            children: [],
          },
        },
      },
      nodeId: '1',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      ply: 0,
      lastPly: 0,
      arrows: [],
      orientation: 'white',
      flipBoard: jest.fn(),
      promotion: null,
      resolvePromotion: jest.fn(),
      onPieceDrop: jest.fn(),
      newGame: jest.fn(),
      nextMoves: [
        {
          san: 'e4',
          from: 'e2',
          to: 'e4',
          opening: {
            name: "King's Pawn Opening",
            eco: 'A00',
          },
        },
      ],
      playMove: jest.fn(),
      setHoveredMove: jest.fn(),
      goToNode: jest.fn(),
      goToPly: jest.fn(),
    };

    render(<OpeningsPanel state={mockState} />);

    const nextMoveItem = screen.getByTestId('openings-next-move-e4');
    fireEvent.mouseEnter(nextMoveItem);

    expect(mockState.setHoveredMove).toHaveBeenCalledWith(mockState.nextMoves[0]);
  });

  it('should reset hovered move on mouse leave', () => {
    const mockState = {
      tree: {
        root: {
          id: '1',
          fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
          children: [],
        },
        nodes: {
          '1': {
            id: '1',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            children: [],
          },
        },
      },
      nodeId: '1',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      ply: 0,
      lastPly: 0,
      arrows: [],
      orientation: 'white',
      flipBoard: jest.fn(),
      promotion: null,
      resolvePromotion: jest.fn(),
      onPieceDrop: jest.fn(),
      newGame: jest.fn(),
      nextMoves: [
        {
          san: 'e4',
          from: 'e2',
          to: 'e4',
          opening: {
            name: "King's Pawn Opening",
            eco: 'A00',
          },
        },
      ],
      playMove: jest.fn(),
      setHoveredMove: jest.fn(),
      goToNode: jest.fn(),
      goToPly: jest.fn(),
    };

    render(<OpeningsPanel state={mockState} />);

    const nextMoveItem = screen.getByTestId('openings-next-move-e4');
    fireEvent.mouseLeave(nextMoveItem);

    expect(mockState.setHoveredMove).toHaveBeenCalledWith(null);
  });
});
