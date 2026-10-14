import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Database, LockKeyhole, Construction } from 'lucide-react';
import { modules } from '../modules';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import NotFoundPage from './NotFoundPage';
export default function ModuleStatusPage() {
  const { module: slug } = useParams();
  const module = modules.find((item) => item.path === slug);
  if (!module) return <NotFoundPage embedded />;
  const Icon = module.Icon;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">WORKSPACE MODULE</p>
          <h1>{module.title}</h1>
          <p>{module.description}</p>
        </div>
        <Badge tone="amber">Planned · Phase {module.phase}</Badge>
      </div>
      <Card className="module-status">
        <span className="module-icon">
          <Icon size={36} />
        </span>
        <p className="eyebrow">A FOUNDATION, TAKING SHAPE</p>
        <h2>
          {module.title} is coming in Phase {module.phase}.
        </h2>
        <p>
          This page establishes the workspace navigation. No records can be viewed, created, or
          changed here yet. The module will connect to the Express API and MySQL in its
          implementation phase.
        </p>
        <div className="module-milestones">
          <span>
            <Check size={18} /> Interface route established
          </span>
          <span>
            <Database size={18} /> Database integration planned
          </span>
          <span>
            <LockKeyhole size={18} /> Server permissions planned
          </span>
          <span>
            <Construction size={18} /> Operations not yet available
          </span>
        </div>
        <Link to="/app" className="button">
          {' '}
          <ArrowLeft size={17} /> Back to overview
        </Link>
      </Card>
    </>
  );
}
