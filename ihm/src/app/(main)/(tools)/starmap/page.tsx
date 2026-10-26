import { redirect } from 'next/navigation';

/** Legacy 3D starmap route — locations live in the Nexus. */
export default function Page() {
  redirect('/?category=locations');
}
