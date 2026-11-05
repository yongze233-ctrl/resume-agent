import { Suspense } from 'react';
import AgentScaffold from '../_components/AgentScaffold';
import ResourceHub from '../_components/learning/ResourceHub';

export default function LearningPage() {
  return (
    <AgentScaffold>
      <Suspense fallback={<div role="status">正在打开课程与岗位…</div>}>
        <ResourceHub />
      </Suspense>
    </AgentScaffold>
  );
}
