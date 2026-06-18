import type { Metadata } from 'next';
import ForSaleView from './ForSaleView';

export const metadata: Metadata = {
  title: 'Buy & Sell',
  description: 'Boats for sale and boat gear listings on SeaLink',
};

export default function ForSalePage() {
  return <ForSaleView />;
}