import { Outlet, useLocation } from "react-router-dom";
import AuthorInfo from "../../components/AuthorInfo";
import ContainerRow from "../../components/ContainerRow";
import NavItem from "../../components/NavItem";

function getProfileAccountAgeDays(state) {
  const createdAt = state?.createdAt ?? state?.author?.createdAt;
  if (!createdAt) return 30;
  const joinedAt = new Date(createdAt).getTime();
  if (Number.isNaN(joinedAt)) return 30;
  return Math.max(1, Math.ceil((Date.now() - joinedAt) / 86400000));
}
function Profile() {
  const { state } = useLocation();

  return (
    <div className="profile-page">
      <div className="user-info">
        <ContainerRow>
          <AuthorInfo />
          <p className="profile-account-age">
            Member for {getProfileAccountAgeDays(state)} days
          </p>
        </ContainerRow>
      </div>

      <ContainerRow>
        <div className="col-xs-12 col-md-10 offset-md-1">
          <div className="articles-toggle">
            <ul className="nav nav-pills outline-active">
              <NavItem text="My Articles" url="" state={state} />
              <NavItem text="Favorited Articles" url="favorites" state={state} />
            </ul>
          </div>
          <Outlet />
        </div>
      </ContainerRow>
    </div>
  );
}

export default Profile;
